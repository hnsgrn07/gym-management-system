import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { ageFrom, bmiFrom, HttpError, localDate } from '../util.ts';
import { coverageSql, withStatus } from './membership.ts';

export interface MemberRow {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: number;
  created_at: string;
  member_code: string;
  birthdate: string | null;
  gender: string | null;
  emergency_contact: string | null;
  goal: string | null;
  coach_id: number | null;
  coach_name: string | null;
  coach_notes: string | null;
  paid_through: string | null;
  covered: number;
}

const MEMBER_SELECT = `
  SELECT u.id, u.username, u.full_name, u.email, u.phone, u.active, u.created_at,
         m.member_code, m.birthdate, m.gender, m.emergency_contact, m.goal, m.coach_id, m.coach_notes,
         c.full_name AS coach_name,
         ${coverageSql('u')},
         EXISTS (SELECT 1 FROM attendance a WHERE a.member_id = u.id AND a.time_out IS NULL) AS inside,
         (SELECT MAX(a.time_in) FROM attendance a WHERE a.member_id = u.id) AS last_visit
    FROM users u
    JOIN members m ON m.user_id = u.id
    LEFT JOIN users c ON c.id = m.coach_id`;

export function getMember(id: number) {
  const row = get<MemberRow & { inside: number; last_visit: string | null }>(`${MEMBER_SELECT} WHERE u.id = ?`, id);
  if (!row) throw new HttpError(404, 'Member not found.');
  return { ...withStatus(row), age: ageFrom(row.birthdate), inside: !!row.inside };
}

export function searchMembers(opts: { q?: string; coachId?: number; limit?: number; status?: string }) {
  const where: string[] = ["u.role = 'member'"];
  const params: (string | number)[] = [];
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    where.push('(u.full_name LIKE ? OR m.member_code LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
    params.push(like, like, like, like, like);
  }
  if (opts.coachId) {
    where.push('m.coach_id = ?');
    params.push(opts.coachId);
  }
  const rows = all<MemberRow & { inside: number; last_visit: string | null }>(
    `${MEMBER_SELECT} WHERE ${where.join(' AND ')} ORDER BY u.active DESC, u.full_name LIMIT ?`,
    ...params,
    opts.limit ?? 200,
  );
  const mapped = rows.map((r) => ({ ...withStatus(r), age: ageFrom(r.birthdate), inside: !!r.inside }));
  return opts.status ? mapped.filter((r) => r.status === opts.status) : mapped;
}

export function nextMemberCode(): string {
  const row = get<{ n: number }>("SELECT COUNT(*) AS n FROM members");
  let n = (row?.n ?? 0) + 1;
  // Skip any codes already taken (e.g. after deletions or manual edits).
  while (get('SELECT 1 FROM members WHERE member_code = ?', `M-${String(n).padStart(4, '0')}`)) n++;
  return `M-${String(n).padStart(4, '0')}`;
}

// ---------- Body stats ----------

const num = (min: number, max: number) => z.coerce.number().min(min).max(max).nullable().optional();
export const statsSchema = z
  .object({
    recorded_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    weight_kg: num(20, 400),
    height_cm: num(80, 250),
    body_fat_pct: num(2, 70),
    muscle_pct: num(5, 80),
    waist_cm: num(30, 250),
    chest_cm: num(30, 250),
    hips_cm: num(30, 250),
    arm_cm: num(10, 100),
    thigh_cm: num(20, 150),
    resting_hr: z.coerce.number().int().min(25).max(220).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    at: z.string().optional(),
  })
  .refine((v) => v.weight_kg != null || v.height_cm != null || v.body_fat_pct != null || v.waist_cm != null, {
    message: 'Enter at least one measurement (weight, height, body fat, or waist).',
  });

export function addStats(memberId: number, input: z.infer<typeof statsSchema>, by: number) {
  const date = input.recorded_on ?? (input.at ? input.at.slice(0, 10) : localDate());
  if (date > localDate()) throw new HttpError(400, "Date can't be in the future.");
  const r = run(
    `INSERT INTO body_stats (member_id, recorded_on, weight_kg, height_cm, body_fat_pct, muscle_pct, waist_cm,
       chest_cm, hips_cm, arm_cm, thigh_cm, resting_hr, notes, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    memberId, date, input.weight_kg, input.height_cm, input.body_fat_pct, input.muscle_pct, input.waist_cm,
    input.chest_cm, input.hips_cm, input.arm_cm, input.thigh_cm, input.resting_hr, input.notes?.trim() || null, by,
  );
  return { id: r.id };
}

interface StatRow {
  id: number;
  recorded_on: string;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  [k: string]: unknown;
}

/** Stats oldest to newest, with BMI computed using the most recent known height. */
export function listStats(memberId: number) {
  const rows = all<StatRow & { recorded_by_name: string | null; recorded_by_role: string | null }>(
    `SELECT s.*, u.full_name AS recorded_by_name, u.role AS recorded_by_role
       FROM body_stats s LEFT JOIN users u ON u.id = s.recorded_by
      WHERE s.member_id = ? ORDER BY s.recorded_on, s.id`,
    memberId,
  );
  let lastHeight: number | null = null;
  return rows.map((r) => {
    if (r.height_cm) lastHeight = r.height_cm;
    return { ...r, bmi: bmiFrom(r.weight_kg, r.height_cm ?? lastHeight) };
  });
}

// ---------- Workouts ----------

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, 'Exercise name is required').max(120),
  sets: z.coerce.number().int().min(0).max(50).nullable().optional(),
  reps: z.string().trim().max(40).nullable().optional(),
  load: z.string().trim().max(40).nullable().optional(),
  rest_sec: z.coerce.number().int().min(0).max(1800).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});

export const workoutSchema = z.object({
  title: z.string().trim().min(1, 'Give the workout a title').max(120),
  day_label: z.string().trim().max(40).nullable().optional(),
  focus: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  exercises: z.array(exerciseSchema).min(1, 'Add at least one exercise').max(40),
});

export function saveWorkout(opts: { id?: number; memberId: number; coachId: number; input: z.infer<typeof workoutSchema> }) {
  return tx(() => {
    const { input } = opts;
    let id = opts.id;
    if (id) {
      run(
        `UPDATE workouts SET title = ?, day_label = ?, focus = ?, notes = ?, updated_at = datetime('now','localtime')
          WHERE id = ?`,
        input.title, input.day_label || null, input.focus || null, input.notes || null, id,
      );
      run('DELETE FROM workout_exercises WHERE workout_id = ?', id);
    } else {
      id = run(
        'INSERT INTO workouts (member_id, coach_id, title, day_label, focus, notes) VALUES (?, ?, ?, ?, ?, ?)',
        opts.memberId, opts.coachId, input.title, input.day_label || null, input.focus || null, input.notes || null,
      ).id;
    }
    input.exercises.forEach((e, i) => {
      run(
        `INSERT INTO workout_exercises (workout_id, position, name, sets, reps, load, rest_sec, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id!, i, e.name, e.sets ?? null, e.reps || null, e.load || null, e.rest_sec ?? null, e.notes || null,
      );
    });
    return { id: id! };
  });
}

export function listWorkouts(memberId: number, includeArchived = false) {
  const workouts = all<{ id: number; [k: string]: unknown }>(
    `SELECT w.*, c.full_name AS coach_name,
            (SELECT COUNT(*) FROM workout_logs l WHERE l.workout_id = w.id) AS times_done,
            (SELECT MAX(completed_at) FROM workout_logs l WHERE l.workout_id = w.id) AS last_done
       FROM workouts w LEFT JOIN users c ON c.id = w.coach_id
      WHERE w.member_id = ? ${includeArchived ? '' : "AND w.status = 'active'"}
      ORDER BY w.status, w.day_label IS NULL, w.day_label, w.created_at DESC`,
    memberId,
  );
  return workouts.map((w) => ({
    ...w,
    exercises: all('SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position', w.id),
  }));
}

export function workoutLogs(memberId: number, limit = 30) {
  return all(
    `SELECT l.*, w.title FROM workout_logs l JOIN workouts w ON w.id = l.workout_id
      WHERE l.member_id = ? ORDER BY l.completed_at DESC LIMIT ?`,
    memberId,
    limit,
  );
}

export function memberAttendance(memberId: number, limit = 60) {
  return all<{ id: number; date: string; time_in: string; time_out: string | null; auto_closed: number; source: string }>(
    `SELECT id, date, time_in, time_out, auto_closed, source FROM attendance
      WHERE member_id = ? ORDER BY time_in DESC LIMIT ?`,
    memberId,
    limit,
  );
}

export function memberMemberships(memberId: number) {
  return all(
    `SELECT ms.*, p.name AS plan_name, u.full_name AS sold_by
       FROM memberships ms JOIN plans p ON p.id = ms.plan_id LEFT JOIN users u ON u.id = ms.created_by
      WHERE ms.member_id = ? ORDER BY ms.start_date DESC`,
    memberId,
  );
}

/** Visits in the current month and the current weekly streak (consecutive weeks with a visit). */
export function visitSummary(memberId: number) {
  const today = localDate();
  const month = today.slice(0, 7);
  const thisMonth =
    get<{ n: number }>(
      "SELECT COUNT(DISTINCT date) AS n FROM attendance WHERE member_id = ? AND substr(date, 1, 7) = ?",
      memberId,
      month,
    )?.n ?? 0;
  const total = get<{ n: number }>('SELECT COUNT(DISTINCT date) AS n FROM attendance WHERE member_id = ?', memberId)?.n ?? 0;
  const weeks = all<{ wk: string }>(
    "SELECT DISTINCT strftime('%Y-%W', date) AS wk FROM attendance WHERE member_id = ? ORDER BY wk DESC LIMIT 60",
    memberId,
  ).map((r) => r.wk);
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i++) {
    const wk = get<{ wk: string }>("SELECT strftime('%Y-%W', ?) AS wk", localDate(cursor))!.wk;
    if (weeks.includes(wk)) streak++;
    else if (i > 0) break; // the current week may not have a visit yet
    cursor.setDate(cursor.getDate() - 7);
  }
  return { this_month: thisMonth, total_visits: total, week_streak: streak };
}
