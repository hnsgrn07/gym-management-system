import { Router } from 'express';
import { z } from 'zod';
import { me, requireRole } from '../auth.ts';
import { all, get, run } from '../db.ts';
import { checkInMember, checkOut, openSessionForMember, resolveTime } from '../services/attendance.ts';
import {
  addStats, getMember, listStats, listWorkouts, memberAttendance, memberMemberships, statsSchema,
  visitSummary, workoutLogs,
} from '../services/members.ts';
import { leaderboard, liftSchema, logLift, rankCard, recentLifts, strengthProfile, streakWidget } from '../services/ranking.ts';
import { HttpError, parse, toId } from '../util.ts';

/** The signed-in member's own data. */
export const memberRouter = Router();
memberRouter.use(requireRole('member'));

memberRouter.get('/overview', (req, res) => {
  const id = me(req).id;
  const stats = listStats(id);
  res.json({
    profile: getMember(id),
    open_session: openSessionForMember(id) ?? null,
    visits: visitSummary(id),
    latest_stats: stats.at(-1) ?? null,
    previous_stats: stats.at(-2) ?? null,
    workouts: listWorkouts(id),
    recent_logs: workoutLogs(id, 5),
    streak: streakWidget(id),
    league: strengthProfile(id).league,
    points_rank: leaderboard('points', 'month', id).me,
  });
});

memberRouter.get('/ranks', (req, res) => {
  const id = me(req).id;
  res.json({ ...rankCard(id), recent_lifts: recentLifts(id, 30) });
});

memberRouter.post('/lifts', (req, res) => {
  const id = me(req).id;
  res.status(201).json(logLift(id, parse(liftSchema, req.body), id));
});

memberRouter.delete('/lifts/:id', (req, res) => {
  const id = me(req).id;
  const r = run('DELETE FROM lift_logs WHERE id = ? AND member_id = ? AND recorded_by = ?', toId(req.params.id), id, id);
  if (!r.changes) throw new HttpError(404, 'You can only delete lifts you logged yourself.');
  res.json({ ok: true });
});

memberRouter.patch('/leaderboard', (req, res) => {
  const { show } = parse(z.object({ show: z.boolean() }), req.body);
  run('UPDATE members SET show_on_leaderboard = ? WHERE user_id = ?', show, me(req).id);
  res.json({ ok: true });
});

memberRouter.post('/attendance/toggle', (req, res) => {
  const id = me(req).id;
  const { at } = parse(z.object({ at: z.string().optional() }), req.body ?? {});
  const open = openSessionForMember(id);
  if (open) return res.json({ action: 'out', ...checkOut(open.id, at) });
  res.json({ action: 'in', ...checkInMember(id, { source: 'self', by: id, at }) });
});

memberRouter.get('/attendance', (req, res) => {
  res.json(memberAttendance(me(req).id, 120));
});

memberRouter.get('/stats', (req, res) => {
  res.json(listStats(me(req).id));
});

memberRouter.post('/stats', (req, res) => {
  const id = me(req).id;
  res.status(201).json(addStats(id, parse(statsSchema, req.body), id));
});

memberRouter.delete('/stats/:id', (req, res) => {
  const id = me(req).id;
  const r = run('DELETE FROM body_stats WHERE id = ? AND member_id = ? AND recorded_by = ?', toId(req.params.id), id, id);
  if (!r.changes) throw new HttpError(404, 'You can only delete entries you recorded yourself.');
  res.json({ ok: true });
});

memberRouter.get('/workouts', (req, res) => {
  const id = me(req).id;
  res.json({ workouts: listWorkouts(id), logs: workoutLogs(id, 30) });
});

memberRouter.post('/workouts/:id/done', (req, res) => {
  const memberId = me(req).id;
  const workoutId = toId(req.params.id);
  const body = parse(
    z.object({ effort: z.coerce.number().int().min(1).max(5).nullable().optional(), notes: z.string().max(500).nullable().optional(), at: z.string().optional() }),
    req.body ?? {},
  );
  const w = get('SELECT id FROM workouts WHERE id = ? AND member_id = ?', workoutId, memberId);
  if (!w) throw new HttpError(404, 'Workout not found.');
  const r = run(
    'INSERT INTO workout_logs (workout_id, member_id, effort, notes, completed_at) VALUES (?, ?, ?, ?, ?)',
    workoutId, memberId, body.effort ?? null, body.notes?.trim() || null, resolveTime(body.at),
  );
  res.status(201).json({ id: r.id });
});

memberRouter.get('/memberships', (req, res) => {
  const id = me(req).id;
  res.json({
    memberships: memberMemberships(id),
    payments: all('SELECT id, kind, amount, method, note, created_at FROM payments WHERE member_id = ? ORDER BY created_at DESC', id),
  });
});

memberRouter.patch('/profile', (req, res) => {
  const id = me(req).id;
  const body = parse(
    z.object({
      email: z.string().trim().email('Enter a valid email').max(120).or(z.literal('')).nullable().optional(),
      phone: z.string().trim().max(20).nullable().optional(),
      birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).nullable().optional(),
      gender: z.string().trim().max(20).nullable().optional(),
      emergency_contact: z.string().trim().max(120).nullable().optional(),
      goal: z.string().trim().max(200).nullable().optional(),
    }),
    req.body,
  );
  run('UPDATE users SET email = ?, phone = ? WHERE id = ?', body.email || null, body.phone || null, id);
  run(
    'UPDATE members SET birthdate = ?, gender = ?, emergency_contact = ?, goal = ? WHERE user_id = ?',
    body.birthdate || null, body.gender || null, body.emergency_contact || null, body.goal || null, id,
  );
  res.json(getMember(id));
});
