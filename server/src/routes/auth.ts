import { Router } from 'express';
import { z } from 'zod';
import {
  clearLoginFailures, createSession, destroySession, hashPassword, me, recordLoginFailure,
  throttleLogin, verifyPassword, type Role,
} from '../auth.ts';
import { audit, get, run } from '../db.ts';
import { getSettings } from '../services/settings.ts';
import { checkInWalkin, checkOut } from '../services/attendance.ts';
import { HttpError, parse } from '../util.ts';

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
  const body = parse(z.object({ username: z.string().trim().min(1), password: z.string().min(1) }), req.body);
  const key = `${req.ip}:${body.username.toLowerCase()}`;
  throttleLogin(key);
  // Members may sign in with their member code as well as their username.
  const user = get<{ id: number; role: Role; password_hash: string; active: number }>(
    `SELECT u.id, u.role, u.password_hash, u.active FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.username = ? OR m.member_code = ? LIMIT 1`,
    body.username,
    body.username,
  );
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    recordLoginFailure(key);
    throw new HttpError(401, 'That username and password don’t match. Check them and try again.', 'BAD_LOGIN');
  }
  if (!user.active) throw new HttpError(403, 'This account is deactivated. Ask the front desk for help.', 'ACCOUNT_INACTIVE');
  clearLoginFailures(key);
  createSession(res, user.id);
  audit(user.id, 'auth.login');
  res.json({ ok: true });
});

authRouter.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

authRouter.get('/auth/me', (req, res) => {
  res.json({ user: req.user ?? null, settings: publicSettings() });
});

authRouter.post('/auth/password', (req, res) => {
  const user = me(req);
  const body = parse(
    z.object({ current: z.string().min(1), next: z.string().min(6, 'Use at least 6 characters').max(200) }),
    req.body,
  );
  const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id)!;
  if (!verifyPassword(body.current, row.password_hash)) throw new HttpError(400, 'Your current password is incorrect.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(body.next), user.id);
  audit(user.id, 'auth.password_changed');
  res.json({ ok: true });
});

function publicSettings() {
  const s = getSettings();
  return {
    gym_name: s.gym_name,
    currency: s.currency,
    walkin_fee: s.walkin_fee,
    walkin_self_service: s.walkin_self_service,
    open_hours: s.open_hours,
    demo_mode: s.demo_mode,
    expiring_days: s.expiring_days,
  };
}

// ---------- Walk-in self service (from the walk-in's own phone, no account) ----------

const phoneSchema = z.string().trim().min(7, 'Enter a valid phone number').max(20).regex(/^[0-9+()\-\s]+$/, 'Use digits only');

function requireSelfService() {
  if (!getSettings().walkin_self_service) {
    throw new HttpError(403, 'Self check-in is turned off. Please see the front desk.', 'SELF_SERVICE_OFF');
  }
}

authRouter.post('/walkin/in', (req, res) => {
  requireSelfService();
  const body = parse(z.object({ full_name: z.string().trim().min(2, 'Enter your name').max(80), phone: phoneSchema }), req.body);
  const result = checkInWalkin({ fullName: body.full_name, phone: body.phone, source: 'self', by: null, paid: false });
  res.json(result);
});

authRouter.post('/walkin/out', (req, res) => {
  requireSelfService();
  const body = parse(z.object({ phone: phoneSchema }), req.body);
  const open = get<{ id: number; full_name: string }>(
    `SELECT a.id, w.full_name FROM attendance a JOIN walkins w ON w.id = a.walkin_id
      WHERE w.phone = ? AND a.time_out IS NULL ORDER BY a.time_in DESC LIMIT 1`,
    body.phone.trim(),
  );
  if (!open) throw new HttpError(404, 'No open visit for that phone number. Did you time in at the front desk?', 'NOT_IN');
  res.json({ ...checkOut(open.id), name: open.full_name });
});

authRouter.post('/walkin/status', (req, res) => {
  requireSelfService();
  const body = parse(z.object({ phone: phoneSchema }), req.body);
  const open = get<{ id: number; full_name: string; time_in: string; paid: number }>(
    `SELECT a.id, w.full_name, a.time_in, EXISTS (SELECT 1 FROM payments p WHERE p.attendance_id = a.id) AS paid
       FROM attendance a JOIN walkins w ON w.id = a.walkin_id
      WHERE w.phone = ? AND a.time_out IS NULL ORDER BY a.time_in DESC LIMIT 1`,
    body.phone.trim(),
  );
  res.json({ open: open ?? null });
});
