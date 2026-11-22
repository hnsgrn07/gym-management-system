import { Router } from 'express';
import { z } from 'zod';
import { me, requireRole } from '../auth.ts';
import { audit, get, run } from '../db.ts';
import {
  addStats, getMember, listStats, listWorkouts, memberAttendance, saveWorkout, searchMembers, statsSchema,
  visitSummary, workoutLogs, workoutSchema,
} from '../services/members.ts';
import { HttpError, parse, toId } from '../util.ts';

/** Coaches (and admins) read member data and build workouts for them. */
export const coachRouter = Router();
coachRouter.use(requireRole('coach', 'admin'));

coachRouter.get('/members', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const mine = req.query.scope === 'mine';
  res.json(searchMembers({ q, coachId: mine ? me(req).id : undefined }));
});

coachRouter.get('/members/:id', (req, res) => {
  const id = toId(req.params.id);
  res.json({
    profile: getMember(id),
    stats: listStats(id),
    workouts: listWorkouts(id, true),
    logs: workoutLogs(id, 30),
    attendance: memberAttendance(id, 30),
    visits: visitSummary(id),
  });
});

coachRouter.post('/members/:id/stats', (req, res) => {
  const id = toId(req.params.id);
  getMember(id);
  res.status(201).json(addStats(id, parse(statsSchema, req.body), me(req).id));
});

coachRouter.patch('/members/:id/notes', (req, res) => {
  const id = toId(req.params.id);
  const { coach_notes } = parse(z.object({ coach_notes: z.string().max(2000).nullable() }), req.body);
  run('UPDATE members SET coach_notes = ? WHERE user_id = ?', coach_notes?.trim() || null, id);
  res.json({ ok: true });
});

/** A coach takes a member on (or lets them go). */
coachRouter.post('/members/:id/assign', (req, res) => {
  const id = toId(req.params.id);
  const { assign } = parse(z.object({ assign: z.boolean() }), req.body);
  const coachId = me(req).id;
  if (assign) run('UPDATE members SET coach_id = ? WHERE user_id = ?', coachId, id);
  else run('UPDATE members SET coach_id = NULL WHERE user_id = ? AND coach_id = ?', id, coachId);
  audit(coachId, assign ? 'coach.assign' : 'coach.unassign', `member #${id}`);
  res.json(getMember(id));
});

coachRouter.post('/members/:id/workouts', (req, res) => {
  const memberId = toId(req.params.id);
  getMember(memberId);
  const result = saveWorkout({ memberId, coachId: me(req).id, input: parse(workoutSchema, req.body) });
  audit(me(req).id, 'workout.create', `member #${memberId}`);
  res.status(201).json(result);
});

coachRouter.get('/workouts/:id', (req, res) => {
  const w = get<{ member_id: number }>('SELECT member_id FROM workouts WHERE id = ?', toId(req.params.id));
  if (!w) throw new HttpError(404, 'Workout not found.');
  const workout = listWorkouts(w.member_id, true).find((x) => x.id === Number(req.params.id));
  res.json({ workout, member: getMember(w.member_id) });
});

coachRouter.put('/workouts/:id', (req, res) => {
  const id = toId(req.params.id);
  const w = get<{ member_id: number }>('SELECT member_id FROM workouts WHERE id = ?', id);
  if (!w) throw new HttpError(404, 'Workout not found.');
  res.json(saveWorkout({ id, memberId: w.member_id, coachId: me(req).id, input: parse(workoutSchema, req.body) }));
});

coachRouter.patch('/workouts/:id/status', (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['active', 'archived']) }), req.body);
  const r = run("UPDATE workouts SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?", status, toId(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Workout not found.');
  res.json({ ok: true });
});

coachRouter.delete('/workouts/:id', (req, res) => {
  const r = run('DELETE FROM workouts WHERE id = ?', toId(req.params.id));
  if (!r.changes) throw new HttpError(404, 'Workout not found.');
  audit(me(req).id, 'workout.delete', `workout #${req.params.id}`);
  res.json({ ok: true });
});
