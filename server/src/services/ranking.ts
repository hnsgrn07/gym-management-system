/**
 * Strength leagues, gym points, streaks, and leaderboards.
 *
 * Strength: each key lift's estimated one-rep max (Epley) is compared with
 * bodyweight-relative standards (beginner → elite) and scored 0–100.
 * The member's strength score is the average of the lifts they've logged,
 * and the score places them in a league with three divisions.
 */
import { z } from 'zod';
import { all, get, run, tx } from '../db.ts';
import { addDays, HttpError, localDate } from '../util.ts';

export const LIFTS = {
  squat: { name: 'Back squat' },
  bench: { name: 'Bench press' },
  deadlift: { name: 'Deadlift' },
  ohp: { name: 'Overhead press' },
  pullup: { name: 'Pull-up' },
} as const;
export type LiftKey = keyof typeof LIFTS;
const LIFT_KEYS = Object.keys(LIFTS) as LiftKey[];

/** Bodyweight multiples (pull-ups: clean reps) for beginner, novice, intermediate, advanced, elite. */
const STANDARDS: Record<'male' | 'female', Record<LiftKey, number[]>> = {
  male: {
    squat: [0.75, 1.25, 1.5, 2.25, 2.75],
    bench: [0.5, 0.75, 1.25, 1.75, 2.0],
    deadlift: [1.0, 1.5, 2.0, 2.5, 3.0],
    ohp: [0.35, 0.55, 0.8, 1.05, 1.35],
    pullup: [1, 5, 10, 15, 22],
  },
  female: {
    squat: [0.5, 0.75, 1.25, 1.5, 2.0],
    bench: [0.25, 0.5, 0.75, 1.0, 1.5],
    deadlift: [0.5, 1.0, 1.25, 1.75, 2.5],
    ohp: [0.2, 0.35, 0.5, 0.75, 1.0],
    pullup: [0.5, 2, 5, 9, 14],
  },
};
const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const LEVEL_SCORES = [20, 40, 60, 80, 100];

export const LEAGUES = [
  { key: 'iron', name: 'Iron', min: 0 },
  { key: 'bronze', name: 'Bronze', min: 20 },
  { key: 'silver', name: 'Silver', min: 35 },
  { key: 'gold', name: 'Gold', min: 50 },
  { key: 'platinum', name: 'Platinum', min: 65 },
  { key: 'diamond', name: 'Diamond', min: 80 },
  { key: 'elite', name: 'Elite', min: 95 },
] as const;

export const epley = (weight: number, reps: number) => (reps === 1 ? weight : weight * (1 + reps / 30));

function standardsFor(gender: string | null) {
  if (gender === 'Female') return STANDARDS.female;
  if (gender === 'Male') return STANDARDS.male;
  // Unspecified: midpoint of both tables.
  return Object.fromEntries(LIFT_KEYS.map((k) => [k, STANDARDS.male[k].map((v, i) => (v + STANDARDS.female[k][i]) / 2)])) as Record<LiftKey, number[]>;
}

/** Piecewise-linear score: 0 at nothing, 20 at beginner … 100 at elite (capped). */
function scoreRatio(ratio: number, levels: number[]) {
  if (ratio <= 0) return 0;
  if (ratio < levels[0]) return (ratio / levels[0]) * LEVEL_SCORES[0];
  for (let i = 1; i < levels.length; i++) {
    if (ratio < levels[i]) {
      const t = (ratio - levels[i - 1]) / (levels[i] - levels[i - 1]);
      return LEVEL_SCORES[i - 1] + t * (LEVEL_SCORES[i] - LEVEL_SCORES[i - 1]);
    }
  }
  return 100;
}

/** League thresholds for coaching points over the last 30 days (same seven leagues). */
export const COACH_LEAGUE_MINS = [0, 100, 250, 450, 700, 1000, 1400];

export function leagueFor(score: number | null, mins: readonly number[] = LEAGUES.map((l) => l.min)) {
  if (score === null) return null;
  let idx = 0;
  mins.forEach((m, i) => { if (score >= m) idx = i; });
  const league = { ...LEAGUES[idx], min: mins[idx] };
  const next = LEAGUES[idx + 1] ? { ...LEAGUES[idx + 1], min: mins[idx + 1] } : undefined;
  const top = next ? next.min : 100;
  const span = top - league.min;
  const into = score - league.min;
  // Three divisions per league (III → II → I); Elite has none.
  const division = next ? (['III', 'II', 'I'] as const)[Math.min(2, Math.floor((into / span) * 3))] : null;
  return {
    key: league.key,
    name: league.name,
    tier: idx,
    division,
    progress: next ? Math.round((into / span) * 100) : 100,
    next: next ? { name: next.name, needed: Math.max(0, Math.round((next.min - score) * 10) / 10) } : null,
  };
}

interface MemberBasics { gender: string | null; bodyweight: number | null }

function basics(memberId: number): MemberBasics {
  // Members keep gender on their member profile; coaches keep it on their user record.
  const m = get<{ gender: string | null }>(
    'SELECT COALESCE(m.gender, u.gender) AS gender FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.id = ?', memberId);
  if (!m) throw new HttpError(404, 'Person not found.');
  const w = get<{ weight_kg: number }>(
    'SELECT weight_kg FROM body_stats WHERE member_id = ? AND weight_kg IS NOT NULL ORDER BY recorded_on DESC, id DESC LIMIT 1',
    memberId,
  );
  return { gender: m.gender, bodyweight: w?.weight_kg ?? null };
}

function scoreLift(key: LiftKey, e1rm: number, weight: number, reps: number, b: MemberBasics) {
  const levels = standardsFor(b.gender)[key];
  if (!b.bodyweight) return null;
  // Pull-ups score on reps; added weight counts proportionally to bodyweight.
  const value = key === 'pullup' ? reps * (1 + weight / b.bodyweight) : e1rm / b.bodyweight;
  const score = scoreRatio(value, levels);
  let level = 'Untrained';
  levels.forEach((lv, i) => { if (value >= lv) level = LEVELS[i]; });
  const nextLevel = levels.findIndex((lv) => value < lv);
  return {
    ratio: Math.round(value * 100) / 100,
    score: Math.round(score),
    level,
    next_level: nextLevel >= 0 ? {
      name: LEVELS[nextLevel],
      target: key === 'pullup' ? Math.ceil(levels[nextLevel]) : Math.ceil((levels[nextLevel] * b.bodyweight) / 2.5) * 2.5,
    } : null,
  };
}

/** A member's strength profile: best lift per exercise, per-lift scores, overall score, league. */
export function strengthProfile(memberId: number) {
  const b = basics(memberId);
  const bests = all<{ id: number; exercise: LiftKey; weight_kg: number; reps: number; e1rm: number; performed_on: string }>(
    `SELECT l.* FROM lift_logs l
      WHERE l.member_id = ? AND l.id = (
        SELECT x.id FROM lift_logs x WHERE x.member_id = l.member_id AND x.exercise = l.exercise
         ORDER BY x.e1rm DESC, x.performed_on DESC LIMIT 1)`,
    memberId,
  );
  const lifts = LIFT_KEYS.map((key) => {
    const best = bests.find((x) => x.exercise === key);
    const scored = best ? scoreLift(key, best.e1rm, best.weight_kg, best.reps, b) : null;
    return {
      key,
      name: LIFTS[key].name,
      best: best ? { weight_kg: best.weight_kg, reps: best.reps, e1rm: Math.round(best.e1rm * 10) / 10, performed_on: best.performed_on } : null,
      ...(scored ?? { ratio: null, score: null, level: null, next_level: null }),
    };
  });
  const scored = lifts.filter((l) => l.score !== null) as { score: number }[];
  const score = scored.length ? Math.round((scored.reduce((a, l) => a + l.score, 0) / scored.length) * 10) / 10 : null;
  return { bodyweight: b.bodyweight, gender: b.gender, lifts, lifts_logged: scored.length, score, league: leagueFor(score) };
}

// ---------- Lift logging ----------

export const liftSchema = z.object({
  exercise: z.enum(['squat', 'bench', 'deadlift', 'ohp', 'pullup']),
  weight_kg: z.coerce.number().min(0, 'Weight can’t be negative').max(500, 'That weight looks too high'),
  reps: z.coerce.number().int().min(1, 'At least 1 rep').max(50, 'Use 50 reps or fewer'),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(200).nullable().optional(),
  at: z.string().optional(),
});

export function logLift(memberId: number, input: z.infer<typeof liftSchema>, by: number) {
  return tx(() => {
    const date = input.performed_on ?? (input.at ? input.at.slice(0, 10) : localDate());
    if (date > localDate()) throw new HttpError(400, "Date can't be in the future.");
    if (input.exercise !== 'pullup' && input.weight_kg === 0) throw new HttpError(400, 'Enter the weight you lifted.');
    // For pull-ups the stored value is a rep-equivalent (added weight counts extra), so "best" sorts the same way for every lift.
    const e1rm = input.exercise === 'pullup' ? input.reps * (1 + input.weight_kg / 100) : epley(input.weight_kg, input.reps);
    const prevBest = get<{ e1rm: number }>(
      'SELECT MAX(e1rm) AS e1rm FROM lift_logs WHERE member_id = ? AND exercise = ?',
      memberId, input.exercise,
    );
    const isPr = prevBest?.e1rm == null || e1rm > prevBest.e1rm + 0.01;
    const r = run(
      `INSERT INTO lift_logs (member_id, exercise, weight_kg, reps, e1rm, is_pr, performed_on, notes, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memberId, input.exercise, input.weight_kg, input.reps, e1rm, isPr, date, input.notes || null, by,
    );
    return { id: r.id, is_pr: isPr, e1rm: Math.round(e1rm * 10) / 10 };
  });
}

export function recentLifts(memberId: number, limit = 30) {
  return all(
    `SELECT l.*, u.full_name AS recorded_by_name, u.role AS recorded_by_role
       FROM lift_logs l LEFT JOIN users u ON u.id = l.recorded_by
      WHERE l.member_id = ? ORDER BY l.performed_on DESC, l.id DESC LIMIT ?`,
    memberId, limit,
  );
}

// ---------- Streaks ----------

/** Monday of the week containing `date`. */
function weekStart(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

function streakFromDates(dates: string[]) {
  const weeks = [...new Set(dates.map(weekStart))].sort();
  const set = new Set(weeks);
  const thisWeek = weekStart(localDate());
  // The streak stays alive through the current week even before the first visit.
  let cursor = set.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (set.has(cursor)) { current++; cursor = addDays(cursor, -7); }
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of weeks) {
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best, at_risk: current > 0 && !set.has(thisWeek) };
}

export function streakWidget(memberId: number) {
  const dates = all<{ date: string }>('SELECT DISTINCT date FROM attendance WHERE member_id = ?', memberId).map((r) => r.date);
  const monday = weekStart(localDate());
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { date: d, visited: dates.includes(d), today: d === localDate(), future: d > localDate() };
  });
  return { ...streakFromDates(dates), week, visits_this_week: week.filter((d) => d.visited).length };
}

// ---------- Points ----------

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const POINTS = { visit: 10, workout: 15, pr: 25 };

function periodStart(period: 'month' | 'all' | '30d') {
  if (period === '30d') return addDays(localDate(), -29);
  return period === 'month' ? `${localDate().slice(0, 7)}-01` : '0000-01-01';
}

function pointsTable(period: 'month' | 'all') {
  const from = periodStart(period);
  const rows = all<{ member_id: number; visits: number; workouts: number; prs: number }>(
    `SELECT u.id AS member_id,
            (SELECT COUNT(DISTINCT a.date) FROM attendance a WHERE a.member_id = u.id AND a.date >= ?) AS visits,
            (SELECT COUNT(*) FROM workout_logs w WHERE w.member_id = u.id AND date(w.completed_at) >= ?) AS workouts,
            (SELECT COUNT(*) FROM lift_logs l WHERE l.member_id = u.id AND l.is_pr = 1 AND l.performed_on >= ?) AS prs
       FROM users u WHERE u.role = 'member' AND u.active = 1`,
    from, from, from,
  );
  return rows.map((r) => ({ ...r, points: r.visits * POINTS.visit + r.workouts * POINTS.workout + r.prs * POINTS.pr }));
}

// ---------- Leaderboards ----------

export type Board = 'points' | 'strength' | 'streak';

interface Entry {
  member_id: number;
  full_name: string;
  member_code: string;
  value: number;
  detail: string;
  league: ReturnType<typeof leagueFor>;
  rank: number;
  is_me: boolean;
}

function rankAll(rows: Omit<Entry, 'rank' | 'is_me'>[], viewerId: number | null) {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.full_name.localeCompare(b.full_name));
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((r, i) => {
    if (r.value !== prev) rank = i + 1; // ties share a rank
    prev = r.value;
    return { ...r, rank, is_me: r.member_id === viewerId };
  });
}

export function leaderboard(board: Board, period: 'month' | 'all', viewerId: number | null, opts: { includeHidden?: boolean } = {}) {
  const members = all<{ id: number; full_name: string; member_code: string; show: number }>(
    `SELECT u.id, u.full_name, m.member_code, m.show_on_leaderboard AS show
       FROM users u JOIN members m ON m.user_id = u.id WHERE u.role = 'member' AND u.active = 1`,
  );
  const leagues = new Map(members.map((m) => [m.id, strengthProfile(m.id)]));
  let rows: Omit<Entry, 'rank' | 'is_me'>[];
  if (board === 'points') {
    const pts = new Map(pointsTable(period).map((p) => [p.member_id, p]));
    rows = members.map((m) => {
      const p = pts.get(m.id)!;
      return {
        member_id: m.id, full_name: m.full_name, member_code: m.member_code, value: p.points,
        detail: [plural(p.visits, 'visit'), plural(p.workouts, 'workout'), plural(p.prs, 'PR')].join(' · '), league: leagues.get(m.id)!.league,
      };
    });
  } else if (board === 'strength') {
    rows = members
      .map((m) => ({ m, s: leagues.get(m.id)! }))
      .filter(({ s }) => s.score !== null)
      .map(({ m, s }) => ({
        member_id: m.id, full_name: m.full_name, member_code: m.member_code, value: s.score!,
        detail: `${s.lifts_logged} of 5 lifts scored`, league: s.league,
      }));
  } else {
    const att = all<{ member_id: number; date: string }>('SELECT DISTINCT member_id, date FROM attendance WHERE member_id IS NOT NULL');
    const byMember = new Map<number, string[]>();
    for (const a of att) byMember.set(a.member_id, [...(byMember.get(a.member_id) ?? []), a.date]);
    rows = members.map((m) => {
      const s = streakFromDates(byMember.get(m.id) ?? []);
      return {
        member_id: m.id, full_name: m.full_name, member_code: m.member_code, value: s.current,
        detail: `Best ${s.best} wk`, league: leagues.get(m.id)!.league,
      };
    });
  }
  const ranked = rankAll(rows, viewerId);
  const visible = ranked.filter((r) => opts.includeHidden || members.find((m) => m.id === r.member_id)!.show || r.is_me);
  const me = ranked.find((r) => r.is_me) ?? null;
  return {
    board, period, total: ranked.length,
    entries: visible.map((r) => ({ ...r, hidden: !members.find((m) => m.id === r.member_id)!.show })),
    me,
  };
}

/** Everything the member's Ranks page needs. */
export function rankCard(memberId: number) {
  const strength = strengthProfile(memberId);
  const month = pointsTable('month').find((p) => p.member_id === memberId) ?? { visits: 0, workouts: 0, prs: 0, points: 0 };
  const pointsBoard = leaderboard('points', 'month', memberId);
  const strengthBoard = leaderboard('strength', 'all', memberId);
  const streakBoard = leaderboard('streak', 'all', memberId);
  const show = get<{ show: number }>('SELECT show_on_leaderboard AS show FROM members WHERE user_id = ?', memberId)?.show ?? 1;
  return {
    strength,
    points: { ...month, rank: pointsBoard.me?.rank ?? null, of: pointsBoard.total, rules: POINTS },
    strength_rank: strengthBoard.me ? { rank: strengthBoard.me.rank, of: strengthBoard.total } : null,
    streak_rank: streakBoard.me ? { rank: streakBoard.me.rank, of: streakBoard.total } : null,
    streak: streakWidget(memberId),
    show_on_leaderboard: !!show,
  };
}

/** Lightweight league lookup for member lists. */
export function leagueMap(memberIds: number[]) {
  return new Map(memberIds.map((id) => [id, strengthProfile(id)]));
}

// ---------- Coaches ----------

/**
 * Coaching points: how a coach's members are doing.
 * Members count for their current coach; completed workouts count for the coach who wrote them.
 */
export const COACH_POINTS = { member_visit: 2, member_pr: 20, workout_done: 10, workout_built: 5, active_member: 15 };

function coachingTable(period: 'month' | 'all' | '30d') {
  const from = periodStart(period);
  const rows = all<{ coach_id: number; full_name: string; visits: number; prs: number; done: number; built: number; active: number; members: number }>(
    `SELECT u.id AS coach_id, u.full_name,
            (SELECT COUNT(DISTINCT a.member_id || ':' || a.date) FROM attendance a JOIN members m ON m.user_id = a.member_id
              WHERE m.coach_id = u.id AND a.date >= ?) AS visits,
            (SELECT COUNT(*) FROM lift_logs l JOIN members m ON m.user_id = l.member_id
              WHERE m.coach_id = u.id AND l.is_pr = 1 AND l.performed_on >= ?) AS prs,
            (SELECT COUNT(*) FROM workout_logs wl JOIN workouts w ON w.id = wl.workout_id
              WHERE w.coach_id = u.id AND date(wl.completed_at) >= ?) AS done,
            (SELECT COUNT(*) FROM workouts w WHERE w.coach_id = u.id AND date(w.created_at) >= ?) AS built,
            (SELECT COUNT(*) FROM members m JOIN users mu ON mu.id = m.user_id
              WHERE m.coach_id = u.id AND mu.active = 1 AND EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = m.user_id AND ms.cancelled = 0
                AND ms.start_date <= date('now','localtime') AND ms.end_date >= date('now','localtime'))) AS active,
            (SELECT COUNT(*) FROM members m WHERE m.coach_id = u.id) AS members
       FROM users u WHERE u.role = 'coach' AND u.active = 1`,
    from, from, from, from,
  );
  const P = COACH_POINTS;
  return rows.map((r) => ({
    ...r,
    points: r.visits * P.member_visit + r.prs * P.member_pr + r.done * P.workout_done + r.built * P.workout_built + r.active * P.active_member,
  }));
}

/** A coach's coaching league is based on the last 30 days, so it reflects current impact. */
export function coachingProfile(coachId: number) {
  const row = coachingTable('30d').find((r) => r.coach_id === coachId);
  if (!row) return null;
  return { ...row, league: leagueFor(row.points, COACH_LEAGUE_MINS), rules: COACH_POINTS };
}

export type CoachBoard = 'coaching' | 'strength';

export function coachLeaderboard(board: CoachBoard, period: 'month' | 'all', viewerId: number | null) {
  const coaches = all<{ id: number; full_name: string }>("SELECT id, full_name FROM users WHERE role = 'coach' AND active = 1");
  const coachingLeagues = new Map(coachingTable('30d').map((r) => [r.coach_id, leagueFor(r.points, COACH_LEAGUE_MINS)]));
  let rows: Omit<Entry, 'rank' | 'is_me'>[];
  if (board === 'coaching') {
    rows = coachingTable(period).map((r) => ({
      member_id: r.coach_id, full_name: r.full_name, member_code: '', value: r.points,
      detail: [plural(r.members, 'member'), plural(r.prs, 'member PR'), plural(r.done, 'workout') + ' done'].join(' · '),
      league: coachingLeagues.get(r.coach_id) ?? null,
    }));
  } else {
    rows = coaches
      .map((c) => ({ c, s: strengthProfile(c.id) }))
      .filter(({ s }) => s.score !== null)
      .map(({ c, s }) => ({
        member_id: c.id, full_name: c.full_name, member_code: '', value: s.score!,
        detail: `${s.lifts_logged} of 5 lifts scored`, league: s.league,
      }));
  }
  const ranked = rankAll(rows, viewerId);
  return { board, period, total: ranked.length, entries: ranked, me: ranked.find((r) => r.is_me) ?? null };
}

/** Everything a coach's own Ranks page needs. */
export function coachRankCard(coachId: number) {
  const g = get<{ gender: string | null }>('SELECT gender FROM users WHERE id = ?', coachId);
  return {
    coaching: coachingProfile(coachId),
    coaching_rank: coachLeaderboard('coaching', 'month', coachId).me,
    lifter: strengthProfile(coachId),
    lifter_rank: coachLeaderboard('strength', 'all', coachId).me,
    gender: g?.gender ?? null,
    recent_lifts: recentLifts(coachId, 30),
  };
}
