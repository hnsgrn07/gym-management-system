import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, me, requireRole } from '../auth.ts';
import { all, audit, get, run, tx } from '../db.ts';
import {
  attendanceForDate, checkInMember, checkInWalkin, checkOut, closeStaleSessions, collectWalkinFee, insideNow,
} from '../services/attendance.ts';
import { sellMembership } from '../services/membership.ts';
import {
  getMember, memberAttendance, memberMemberships, nextMemberCode, searchMembers,
} from '../services/members.ts';
import { HttpError, localDate, parse, toId } from '../util.ts';

/** Front desk: clerks and admins. */
export const deskRouter = Router();
deskRouter.use(requireRole('clerk', 'admin'));

const method = z.enum(['cash', 'card', 'ewallet', 'bank', 'other']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2025-01-31');

deskRouter.get('/summary', (_req, res) => {
  closeStaleSessions();
  const today = localDate();
  const visits = get<{ members: number; walkins: number }>(
    `SELECT COALESCE(SUM(member_id IS NOT NULL), 0) AS members, COALESCE(SUM(walkin_id IS NOT NULL), 0) AS walkins
       FROM attendance WHERE date = ?`,
    today,
  )!;
  const revenue = get<{ total: number; n: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM payments WHERE date(created_at) = ?',
    today,
  )!;
  const expiring = searchMembers({ status: 'expiring', limit: 500 }).slice(0, 8);
  res.json({ inside: insideNow(), visits, revenue, expiring });
});

deskRouter.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.json({ members: [], walkins: [] });
  const members = searchMembers({ q, limit: 12 });
  const like = `%${q}%`;
  const walkins = all(
    `SELECT w.id, w.full_name, w.phone, MAX(a.time_in) AS last_visit, COUNT(a.id) AS visits,
            EXISTS (SELECT 1 FROM attendance x WHERE x.walkin_id = w.id AND x.time_out IS NULL) AS inside
       FROM walkins w LEFT JOIN attendance a ON a.walkin_id = w.id
      WHERE (w.full_name LIKE ? OR w.phone LIKE ?) AND w.converted_member_id IS NULL
      GROUP BY w.id ORDER BY last_visit DESC LIMIT 6`,
    like,
    like,
  );
  res.json({ members, walkins });
});

deskRouter.post('/checkin', (req, res) => {
  const body = parse(z.object({ member_id: z.number().int(), force: z.boolean().optional(), at: z.string().optional() }), req.body);
  const result = checkInMember(body.member_id, { source: 'desk', by: me(req).id, force: body.force, at: body.at });
  if (body.force) audit(me(req).id, 'attendance.override', `${result.name} timed in without an active membership`);
  res.json(result);
});

deskRouter.post('/checkout', (req, res) => {
  const body = parse(z.object({ attendance_id: z.number().int(), at: z.string().optional() }), req.body);
  res.json(checkOut(body.attendance_id, body.at));
});

deskRouter.post('/walkins', (req, res) => {
  const body = parse(
    z.object({
      full_name: z.string().trim().min(2, 'Enter the walk-in’s name').max(80),
      phone: z.string().trim().max(20).nullable().optional(),
      paid: z.boolean(),
      method: method.optional(),
      at: z.string().optional(),
    }),
    req.body,
  );
  res.status(201).json(
    checkInWalkin({ fullName: body.full_name, phone: body.phone, source: 'desk', by: me(req).id, paid: body.paid, method: body.method, at: body.at }),
  );
});

deskRouter.post('/attendance/:id/pay', (req, res) => {
  const body = parse(z.object({ method }), req.body);
  res.json(collectWalkinFee(toId(req.params.id), body.method, me(req).id));
});

deskRouter.get('/attendance', (req, res) => {
  const d = typeof req.query.date === 'string' ? parse(date, req.query.date) : localDate();
  closeStaleSessions();
  res.json(attendanceForDate(d));
});

deskRouter.get('/payments', (req, res) => {
  const d = typeof req.query.date === 'string' ? parse(date, req.query.date) : localDate();
  res.json(
    all(
      `SELECT p.*, COALESCE(u.full_name, w.full_name) AS payer, r.full_name AS received_by_name
         FROM payments p
         LEFT JOIN users u ON u.id = p.member_id
         LEFT JOIN walkins w ON w.id = p.walkin_id
         LEFT JOIN users r ON r.id = p.received_by
        WHERE date(p.created_at) = ? ORDER BY p.created_at DESC`,
      d,
    ),
  );
});

// ---------- Members ----------

deskRouter.get('/members', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  res.json(searchMembers({ q, status, limit: 1000 }));
});

deskRouter.get('/members/:id', (req, res) => {
  const id = toId(req.params.id);
  res.json({
    profile: getMember(id),
    memberships: memberMemberships(id),
    attendance: memberAttendance(id, 30),
    payments: all('SELECT p.*, r.full_name AS received_by_name FROM payments p LEFT JOIN users r ON r.id = p.received_by WHERE p.member_id = ? ORDER BY p.created_at DESC', id),
  });
});

const profileFields = {
  full_name: z.string().trim().min(2, 'Enter the member’s full name').max(80),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email('Enter a valid email').max(120).or(z.literal('')).nullable().optional(),
  birthdate: date.or(z.literal('')).nullable().optional(),
  gender: z.string().trim().max(20).nullable().optional(),
  emergency_contact: z.string().trim().max(120).nullable().optional(),
  goal: z.string().trim().max(200).nullable().optional(),
  coach_id: z.number().int().nullable().optional(),
};

deskRouter.post('/members', (req, res) => {
  const body = parse(
    z.object({
      ...profileFields,
      username: z.string().trim().min(3, 'Username needs at least 3 characters').max(40).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, dashes').optional().or(z.literal('')),
      password: z.string().min(6, 'Temporary password needs at least 6 characters').max(200),
      plan_id: z.number().int().nullable().optional(),
      method: method.optional(),
      walkin_id: z.number().int().nullable().optional(),
    }),
    req.body,
  );
  const by = me(req).id;
  const result = tx(() => {
    const walkin = body.walkin_id
      ? get<{ id: number; full_name: string; phone: string | null; converted_member_id: number | null }>('SELECT * FROM walkins WHERE id = ?', body.walkin_id)
      : undefined;
    if (body.walkin_id && !walkin) throw new HttpError(404, 'Walk-in not found.');
    if (walkin?.converted_member_id) throw new HttpError(409, `${walkin.full_name} is already a member.`, 'ALREADY_MEMBER');
    const code = nextMemberCode();
    const username = body.username || code;
    if (get('SELECT 1 FROM users WHERE username = ?', username)) throw new HttpError(409, `The username “${username}” is taken.`);
    const user = run(
      "INSERT INTO users (role, username, password_hash, full_name, email, phone) VALUES ('member', ?, ?, ?, ?, ?)",
      username, hashPassword(body.password), body.full_name, body.email || null, body.phone || walkin?.phone || null,
    );
    run(
      `INSERT INTO members (user_id, member_code, birthdate, gender, emergency_contact, goal, coach_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.id, code, body.birthdate || null, body.gender || null, body.emergency_contact || null, body.goal || null, body.coach_id ?? null,
    );
    let moved = 0;
    if (walkin) {
      // Same person, one record: past walk-in visits and payments now belong to the member.
      moved = run('UPDATE attendance SET member_id = ?, walkin_id = NULL, was_walkin = 1 WHERE walkin_id = ?', user.id, walkin.id).changes;
      run('UPDATE payments SET member_id = ? WHERE walkin_id = ?', user.id, walkin.id);
      run('UPDATE walkins SET converted_member_id = ? WHERE id = ?', user.id, walkin.id);
    }
    const membership = body.plan_id
      ? sellMembership({ memberId: user.id, planId: body.plan_id, method: body.method ?? 'cash', byUserId: by })
      : null;
    audit(by, walkin ? 'member.convert' : 'member.create', `${body.full_name} (${code})${walkin ? `, ${moved} walk-in visits kept` : ''}`);
    return { id: user.id, member_code: code, username, membership, visits_moved: moved };
  });
  res.status(201).json(result);
});

deskRouter.patch('/members/:id', (req, res) => {
  const id = toId(req.params.id);
  const body = parse(z.object(profileFields), req.body);
  getMember(id);
  tx(() => {
    run('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?', body.full_name, body.email || null, body.phone || null, id);
    run(
      'UPDATE members SET birthdate = ?, gender = ?, emergency_contact = ?, goal = ?, coach_id = ? WHERE user_id = ?',
      body.birthdate || null, body.gender || null, body.emergency_contact || null, body.goal || null, body.coach_id ?? null, id,
    );
  });
  audit(me(req).id, 'member.update', `member #${id}`);
  res.json(getMember(id));
});

deskRouter.post('/members/:id/memberships', (req, res) => {
  const id = toId(req.params.id);
  const body = parse(z.object({ plan_id: z.number().int(), method, start_date: date.optional() }), req.body);
  const member = getMember(id);
  const result = sellMembership({ memberId: id, planId: body.plan_id, method: body.method, startDate: body.start_date, byUserId: me(req).id });
  audit(me(req).id, 'membership.sell', `${member.full_name}: ${result.plan_name} ${result.start_date} → ${result.end_date}`);
  res.status(201).json(result);
});

deskRouter.post('/members/:id/reset-password', (req, res) => {
  const id = toId(req.params.id);
  const { password } = parse(z.object({ password: z.string().min(6, 'Use at least 6 characters').max(200) }), req.body);
  const r = run("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'member'", hashPassword(password), id);
  if (!r.changes) throw new HttpError(404, 'Member not found.');
  run('DELETE FROM sessions WHERE user_id = ?', id);
  audit(me(req).id, 'member.password_reset', `member #${id}`);
  res.json({ ok: true });
});

/** A walk-in's details, used to prefill the "make member" form. */
deskRouter.get('/walkins/:id', (req, res) => {
  const w = get<{ id: number; full_name: string; phone: string | null; converted_member_id: number | null }>(
    'SELECT id, full_name, phone, converted_member_id FROM walkins WHERE id = ?', toId(req.params.id));
  if (!w) throw new HttpError(404, 'Walk-in not found.');
  const stats = get<{ visits: number; first_visit: string | null; inside: number }>(
    `SELECT COUNT(*) AS visits, MIN(time_in) AS first_visit, COALESCE(SUM(time_out IS NULL), 0) AS inside
       FROM attendance WHERE walkin_id = ?`, w.id)!;
  const paid = get<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE walkin_id = ?', w.id)!;
  res.json({ ...w, ...stats, total_paid: paid.total });
});

// ---------- Shared lookups for desk forms ----------

deskRouter.get('/coaches', (_req, res) => {
  res.json(all("SELECT id, full_name FROM users WHERE role = 'coach' AND active = 1 ORDER BY full_name"));
});
