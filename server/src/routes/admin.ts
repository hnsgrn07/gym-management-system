import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, me, requireRole } from '../auth.ts';
import { all, audit, get, run } from '../db.ts';
import { searchMembers } from '../services/members.ts';
import { getSettings, saveSettings } from '../services/settings.ts';
import { addDays, HttpError, localDate, parse, toId } from '../util.ts';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- Reports ----------

adminRouter.get('/reports', (req, res) => {
  const to = typeof req.query.to === 'string' ? parse(date, req.query.to) : localDate();
  const from = typeof req.query.from === 'string' ? parse(date, req.query.from) : addDays(to, -29);
  if (from > to) throw new HttpError(400, 'The start date must be before the end date.');

  const revenueByDay = all<{ d: string; membership: number; walkin: number; other: number }>(
    `SELECT date(created_at) AS d,
            SUM(CASE WHEN kind = 'membership' THEN amount ELSE 0 END) AS membership,
            SUM(CASE WHEN kind = 'walkin' THEN amount ELSE 0 END) AS walkin,
            SUM(CASE WHEN kind = 'other' THEN amount ELSE 0 END) AS other
       FROM payments WHERE date(created_at) BETWEEN ? AND ? GROUP BY d ORDER BY d`,
    from, to,
  );
  const visitsByDay = all<{ d: string; members: number; walkins: number }>(
    `SELECT date AS d, SUM(member_id IS NOT NULL) AS members, SUM(walkin_id IS NOT NULL) AS walkins
       FROM attendance WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`,
    from, to,
  );
  const byHour = all<{ h: number; n: number }>(
    `SELECT CAST(strftime('%H', time_in) AS INTEGER) AS h, COUNT(*) AS n
       FROM attendance WHERE date BETWEEN ? AND ? GROUP BY h ORDER BY h`,
    from, to,
  );
  const byMethod = all<{ method: string; total: number }>(
    `SELECT method, SUM(amount) AS total FROM payments WHERE date(created_at) BETWEEN ? AND ? GROUP BY method ORDER BY total DESC`,
    from, to,
  );
  const plans = all<{ name: string; sold: number; total: number }>(
    `SELECT p.name, COUNT(ms.id) AS sold, COALESCE(SUM(ms.price_paid), 0) AS total
       FROM memberships ms JOIN plans p ON p.id = ms.plan_id
      WHERE date(ms.created_at) BETWEEN ? AND ? AND ms.cancelled = 0 GROUP BY p.id ORDER BY total DESC`,
    from, to,
  );
  const members = searchMembers({ limit: 100000 });
  const counts = { active: 0, expiring: 0, expired: 0, pending: 0, none: 0 } as Record<string, number>;
  for (const m of members) if (m.active) counts[m.status]++;
  const newMembers = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND date(created_at) BETWEEN ? AND ?",
    from, to,
  )!.n;

  res.json({ from, to, revenueByDay, visitsByDay, byHour, byMethod, plans, memberCounts: counts, newMembers });
});

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function sendCsv(res: import('express').Response, name: string, rows: Record<string, unknown>[]) {
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const body = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send('﻿' + body);
}

adminRouter.get('/export/:kind', (req, res) => {
  const to = typeof req.query.to === 'string' ? parse(date, req.query.to) : localDate();
  const from = typeof req.query.from === 'string' ? parse(date, req.query.from) : addDays(to, -29);
  if (req.params.kind === 'attendance.csv') {
    return sendCsv(res, `attendance_${from}_${to}.csv`, all(
      `SELECT a.date, a.time_in, a.time_out, CASE WHEN a.member_id IS NULL THEN 'walk-in' ELSE 'member' END AS type,
              COALESCE(u.full_name, w.full_name) AS name, m.member_code, a.source, a.auto_closed
         FROM attendance a LEFT JOIN users u ON u.id = a.member_id LEFT JOIN members m ON m.user_id = a.member_id
         LEFT JOIN walkins w ON w.id = a.walkin_id
        WHERE a.date BETWEEN ? AND ? ORDER BY a.time_in`, from, to));
  }
  if (req.params.kind === 'payments.csv') {
    return sendCsv(res, `payments_${from}_${to}.csv`, all(
      `SELECT p.created_at, p.kind, p.amount, p.method, COALESCE(u.full_name, w.full_name) AS payer, p.note,
              r.full_name AS received_by
         FROM payments p LEFT JOIN users u ON u.id = p.member_id LEFT JOIN walkins w ON w.id = p.walkin_id
         LEFT JOIN users r ON r.id = p.received_by
        WHERE date(p.created_at) BETWEEN ? AND ? ORDER BY p.created_at`, from, to));
  }
  if (req.params.kind === 'members.csv') {
    return sendCsv(res, `members_${localDate()}.csv`, searchMembers({ limit: 100000 }).map((m) => ({
      code: m.member_code, name: m.full_name, phone: m.phone, email: m.email, status: m.status,
      paid_through: m.paid_through, coach: m.coach_name, joined: m.created_at, active_account: m.active,
    })));
  }
  throw new HttpError(404, 'Unknown export.');
});

// ---------- Plans ----------

const planSchema = z.object({
  name: z.string().trim().min(2, 'Name the plan').max(60),
  duration_days: z.coerce.number().int().min(1, 'At least 1 day').max(3660),
  price: z.coerce.number().min(0, 'Price can’t be negative'),
  description: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().optional(),
});

adminRouter.get('/plans', (_req, res) => {
  res.json(all(
    `SELECT p.*, (SELECT COUNT(*) FROM memberships ms WHERE ms.plan_id = p.id) AS times_sold
       FROM plans p ORDER BY p.active DESC, p.duration_days`,
  ));
});

adminRouter.post('/plans', (req, res) => {
  const b = parse(planSchema, req.body);
  const r = run('INSERT INTO plans (name, duration_days, price, description, active) VALUES (?, ?, ?, ?, ?)',
    b.name, b.duration_days, b.price, b.description || null, b.active ?? true);
  audit(me(req).id, 'plan.create', b.name);
  res.status(201).json({ id: r.id });
});

adminRouter.put('/plans/:id', (req, res) => {
  const b = parse(planSchema, req.body);
  const r = run('UPDATE plans SET name = ?, duration_days = ?, price = ?, description = ?, active = ? WHERE id = ?',
    b.name, b.duration_days, b.price, b.description || null, b.active ?? true, toId(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Plan not found.');
  audit(me(req).id, 'plan.update', b.name);
  res.json({ ok: true });
});

// ---------- Users (staff + member account status) ----------

adminRouter.get('/staff', (_req, res) => {
  res.json(all(
    `SELECT id, role, username, full_name, email, phone, active, created_at,
            (SELECT MAX(created_at) FROM audit_log a WHERE a.user_id = u.id AND a.action = 'auth.login') AS last_login
       FROM users u WHERE role IN ('admin','clerk','coach') ORDER BY active DESC, role, full_name`,
  ));
});

const staffSchema = z.object({
  role: z.enum(['admin', 'clerk', 'coach']),
  username: z.string().trim().min(3, 'Username needs at least 3 characters').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, dashes'),
  full_name: z.string().trim().min(2, 'Enter their full name').max(80),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});

adminRouter.post('/staff', (req, res) => {
  const b = parse(staffSchema.extend({ password: z.string().min(6, 'Password needs at least 6 characters') }), req.body);
  if (get('SELECT 1 FROM users WHERE username = ?', b.username)) throw new HttpError(409, `The username “${b.username}” is taken.`);
  const r = run('INSERT INTO users (role, username, password_hash, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
    b.role, b.username, hashPassword(b.password), b.full_name, b.email || null, b.phone || null);
  audit(me(req).id, 'staff.create', `${b.full_name} (${b.role})`);
  res.status(201).json({ id: r.id });
});

adminRouter.put('/staff/:id', (req, res) => {
  const id = toId(req.params.id);
  const b = parse(staffSchema.extend({ password: z.string().min(6).optional().or(z.literal('')) }), req.body);
  if (id === me(req).id && b.role !== 'admin') throw new HttpError(400, 'You can’t remove your own admin role.');
  const clash = get<{ id: number }>('SELECT id FROM users WHERE username = ?', b.username);
  if (clash && clash.id !== id) throw new HttpError(409, `The username “${b.username}” is taken.`);
  const r = run("UPDATE users SET role = ?, username = ?, full_name = ?, email = ?, phone = ? WHERE id = ? AND role != 'member'",
    b.role, b.username, b.full_name, b.email || null, b.phone || null, id);
  if (!r.changes) throw new HttpError(404, 'Staff member not found.');
  if (b.password) {
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(b.password), id);
    run('DELETE FROM sessions WHERE user_id = ?', id);
  }
  audit(me(req).id, 'staff.update', b.full_name);
  res.json({ ok: true });
});

/** Activate or deactivate any account (staff or member). Deactivation signs them out everywhere. */
adminRouter.patch('/users/:id/active', (req, res) => {
  const id = toId(req.params.id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  if (id === me(req).id && !active) throw new HttpError(400, 'You can’t deactivate your own account.');
  const r = run('UPDATE users SET active = ? WHERE id = ?', active, id);
  if (!r.changes) throw new HttpError(404, 'Account not found.');
  if (!active) run('DELETE FROM sessions WHERE user_id = ?', id);
  audit(me(req).id, active ? 'user.activate' : 'user.deactivate', `user #${id}`);
  res.json({ ok: true });
});

// ---------- Settings ----------

adminRouter.get('/settings', (_req, res) => res.json(getSettings()));

adminRouter.put('/settings', (req, res) => {
  const b = parse(
    z.object({
      gym_name: z.string().trim().min(1, 'Enter the gym name').max(60),
      currency: z.string().trim().length(3, 'Use a 3-letter currency code like PHP or USD').toUpperCase(),
      walkin_fee: z.coerce.number().min(0, 'Fee can’t be negative'),
      expiring_days: z.coerce.number().int().min(1).max(60),
      walkin_self_service: z.boolean(),
      open_hours: z.string().trim().max(120),
      demo_mode: z.boolean(),
    }).partial(),
    req.body,
  );
  if (b.currency) {
    try { new Intl.NumberFormat('en', { style: 'currency', currency: b.currency }); }
    catch { throw new HttpError(400, `“${b.currency}” isn’t a recognised currency code.`); }
  }
  saveSettings(b);
  audit(me(req).id, 'settings.update', Object.keys(b).join(', '));
  res.json(getSettings());
});

// ---------- Activity log ----------

adminRouter.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(all(
    `SELECT a.*, u.full_name, u.role FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.action != 'auth.login' OR ? = '1'
      ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
    String(req.query.logins ?? '0'), limit,
  ));
});
