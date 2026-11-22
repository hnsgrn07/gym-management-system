/**
 * Demo data so every portal has something to show on first run.
 * All people and numbers here are fictional. Run `npm run seed` to reset.
 */
import { db, migrate, run, tx } from './db.ts';
import { hashPassword } from './auth.ts';
import { saveSettings } from './services/settings.ts';
import { logLift, type LiftKey } from './services/ranking.ts';
import { get } from './db.ts';
import { addDays, localDate, localDateTime } from './util.ts';

// Deterministic PRNG so the demo looks the same every time.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const at = (date: string, h: number, m: number) => `${date} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

export function seedDemo() {
  tx(() => {
    saveSettings({
      gym_name: 'Demo Gym',
      currency: 'USD',
      walkin_fee: 8,
      expiring_days: 7,
      walkin_self_service: true,
      open_hours: 'Mon–Sat 6:00–22:00 · Sun 8:00–18:00',
      demo_mode: true,
    });

    const plan = (name: string, days: number, price: number, description: string) =>
      run('INSERT INTO plans (name, duration_days, price, description) VALUES (?, ?, ?, ?)', name, days, price, description).id;
    const monthly = plan('Monthly', 30, 45, 'Unlimited gym access for 30 days');
    const quarterly = plan('Quarterly', 90, 120, 'Unlimited access for 90 days, save 11%');
    const annual = plan('Annual', 365, 420, 'Unlimited access for a full year');
    const student = plan('Student monthly', 30, 35, 'Requires a valid student ID');
    const prices: Record<number, [number, number]> = { [monthly]: [30, 45], [quarterly]: [90, 120], [annual]: [365, 420], [student]: [30, 35] };

    const user = (role: string, username: string, password: string, name: string, phone?: string, email?: string) =>
      run('INSERT INTO users (role, username, password_hash, full_name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        role, username, hashPassword(password), name, phone ?? null, email ?? null, at(addDays(localDate(), -200), 9, 0)).id;

    const admin = user('admin', 'admin', 'admin123', 'Alex Rivera', '0917 555 0100', 'alex@example.com');
    const clerk = user('clerk', 'clerk', 'clerk123', 'Jamie Santos', '0917 555 0101');
    const coach = user('coach', 'coach', 'coach123', 'Marco Reyes', '0917 555 0102');
    const coach2 = user('coach', 'dana', 'coach123', 'Dana Lee', '0917 555 0103');
    void admin;

    const today = localDate();
    // [name, gender, birth year, plan, days since membership started (negative = in the future), coach]
    const people: [string, string, number, number, number, number | null][] = [
      ['Chris Navarro', 'Male', 1996, quarterly, 40, coach],
      ['Bea Mendoza', 'Female', 2001, monthly, 25, coach],
      ['Paolo Cruz', 'Male', 1990, annual, 120, coach],
      ['Liza Tan', 'Female', 1988, monthly, 10, coach2],
      ['Rafael Gomez', 'Male', 1999, student, 27, null],
      ['Nina Villanueva', 'Female', 1994, quarterly, 85, coach2],
      ['Mark Dizon', 'Male', 1985, monthly, 45, null],
      ['Sofia Ramos', 'Female', 2003, student, 5, coach],
      ['Ken Aquino', 'Male', 1992, monthly, 62, null],
      ['Grace Lim', 'Female', 1979, annual, 300, coach2],
      ['Josh Bautista', 'Male', 1998, monthly, 29, coach],
      ['Ella Fernandez', 'Female', 1997, quarterly, 2, null],
    ];

    const memberIds: number[] = [];
    people.forEach(([name, gender, year, planId, startedAgo, coachId], i) => {
      const code = `M-${String(i + 1).padStart(4, '0')}`;
      const username = i === 0 ? 'member' : name.split(' ')[0].toLowerCase();
      const id = run(
        'INSERT INTO users (role, username, password_hash, full_name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        'member', username, hashPassword('member123'), name, `0918 555 ${String(1000 + i * 37).slice(-4)}`,
        `${username}@example.com`, at(addDays(today, -startedAgo - 30), 10, 0),
      ).id;
      run(
        'INSERT INTO members (user_id, member_code, birthdate, gender, emergency_contact, goal, coach_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, code, `${year}-${String(1 + (i % 12)).padStart(2, '0')}-${String(3 + i).padStart(2, '0')}`, gender,
        'Family contact · 0919 555 0000', pick(['Lose fat', 'Build muscle', 'Get stronger', 'General fitness', 'Train for a 10K']), coachId,
      );
      const [days, price] = prices[planId];
      const start = addDays(today, -startedAgo);
      const ms = run(
        'INSERT INTO memberships (member_id, plan_id, start_date, end_date, price_paid, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, planId, start, addDays(start, days - 1), price, clerk, at(start, 9, 15),
      ).id;
      run(
        `INSERT INTO payments (kind, amount, method, member_id, membership_id, note, received_by, created_at)
         VALUES ('membership', ?, ?, ?, ?, ?, ?, ?)`,
        price, pick(['cash', 'cash', 'ewallet', 'card']), id, ms, 'Plan purchase', clerk, at(start, 9, 15),
      );
      memberIds.push(id);
    });

    // One member with no membership yet.
    const newbie = run(
      "INSERT INTO users (role, username, password_hash, full_name, phone) VALUES ('member', 'ivy', ?, 'Ivy Castillo', '0918 555 7788')",
      hashPassword('member123'),
    ).id;
    run("INSERT INTO members (user_id, member_code, gender, goal) VALUES (?, 'M-0013', 'Female', 'General fitness')", newbie);

    // Attendance over the last 30 days (members who are covered on that day).
    for (let ago = 30; ago >= 1; ago--) {
      const date = addDays(today, -ago);
      people.forEach(([, , , planId, startedAgo], i) => {
        const [days] = prices[planId];
        const coveredThatDay = startedAgo >= ago && startedAgo - days < ago;
        if (!coveredThatDay || rand() > 0.45) return;
        const h = pick([6, 7, 7, 8, 12, 17, 18, 18, 19, 20]);
        const m = Math.floor(rand() * 60);
        const dur = 50 + Math.floor(rand() * 70);
        const out = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
        out.setMinutes(out.getMinutes() + dur);
        const tout = `${date} ${String(out.getHours()).padStart(2, '0')}:${String(out.getMinutes()).padStart(2, '0')}:00`;
        run("INSERT INTO attendance (member_id, date, time_in, time_out, source, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
          memberIds[i], date, at(date, h, m), tout, rand() > 0.5 ? 'self' : 'desk', clerk);
      });
      // Walk-ins
      const n = Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const name = pick(['Leo Santos', 'Mia Reyes', 'Carlo Diaz', 'Ana Torres', 'Ben Uy', 'Joy Pascual', 'Rico Lopez']);
        const phone = `0920 555 ${String(Math.floor(rand() * 9000) + 1000)}`;
        const w = run('INSERT INTO walkins (full_name, phone, created_at) VALUES (?, ?, ?)', name, phone, at(date, 9, 0)).id;
        const h = 8 + Math.floor(rand() * 11);
        const a = run("INSERT INTO attendance (walkin_id, date, time_in, time_out, source, recorded_by) VALUES (?, ?, ?, ?, 'desk', ?)",
          w, date, at(date, h, 10), at(date, h + 1, 25), clerk).id;
        run("INSERT INTO payments (kind, amount, method, walkin_id, attendance_id, note, received_by, created_at) VALUES ('walkin', 8, 'cash', ?, ?, 'Walk-in day pass', ?, ?)",
          w, a, clerk, at(date, h, 10));
      }
    }

    // People inside right now.
    // Times are minutes before now, never earlier than midnight, so they always land on today.
    const ago = (min: number) => {
      const d = new Date();
      const minutesToday = d.getHours() * 60 + d.getMinutes();
      d.setMinutes(d.getMinutes() - Math.min(min, minutesToday));
      return localDateTime(d);
    };
    [0, 2, 5].forEach((i, k) => {
      run("INSERT INTO attendance (member_id, date, time_in, source, recorded_by) VALUES (?, ?, ?, 'desk', ?)",
        memberIds[i], today, ago([72, 41, 18][k]), clerk);
    });
    const w1 = run("INSERT INTO walkins (full_name, phone) VALUES ('Leo Santos', '0920 555 4411')").id;
    const a1 = run("INSERT INTO attendance (walkin_id, date, time_in, source, recorded_by) VALUES (?, ?, ?, 'desk', ?)", w1, today, ago(55), clerk).id;
    run("INSERT INTO payments (kind, amount, method, walkin_id, attendance_id, note, received_by) VALUES ('walkin', 8, 'cash', ?, ?, 'Walk-in day pass', ?)", w1, a1, clerk);
    const w2 = run("INSERT INTO walkins (full_name, phone) VALUES ('Mia Reyes', '0920 555 8820')").id;
    run("INSERT INTO attendance (walkin_id, date, time_in, source) VALUES (?, ?, ?, 'self')", w2, today, ago(9));

    // Body stats history: every ~10 days for a few members.
    const statPeople: [number, number, number, number][] = [
      [0, 176, 84.5, 24], [1, 162, 63, 29], [2, 181, 92, 22], [5, 165, 70, 31], [7, 158, 55, 26], [10, 172, 78, 21],
    ];
    for (const [i, height, startW, fat] of statPeople) {
      for (let k = 0; k < 6; k++) {
        const date = addDays(today, -50 + k * 10);
        run(
          `INSERT INTO body_stats (member_id, recorded_on, weight_kg, height_cm, body_fat_pct, waist_cm, resting_hr, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          memberIds[i], date, Math.round((startW - k * 0.6 + (rand() - 0.5)) * 10) / 10, k === 0 ? height : null,
          Math.round((fat - k * 0.4) * 10) / 10, Math.round(height * 0.48 - k * 0.5), 68 - k, k % 2 ? coach : memberIds[i],
        );
      }
    }

    // Workouts from coaches.
    const workout = (memberIdx: number, coachId: number, title: string, day: string, focus: string, notes: string, ex: [string, number, string, string, number][]) => {
      const w = run('INSERT INTO workouts (member_id, coach_id, title, day_label, focus, notes) VALUES (?, ?, ?, ?, ?, ?)',
        memberIds[memberIdx], coachId, title, day, focus, notes).id;
      ex.forEach(([name, sets, reps, load, rest], p) =>
        run('INSERT INTO workout_exercises (workout_id, position, name, sets, reps, load, rest_sec) VALUES (?, ?, ?, ?, ?, ?, ?)',
          w, p, name, sets, reps, load, rest));
      return w;
    };
    const w1a = workout(0, coach, 'Upper body strength', 'Monday', 'Push / pull', 'Warm up 5 min on the rower first. Keep 1–2 reps in reserve.', [
      ['Bench press', 4, '6–8', '60 kg', 120], ['Bent-over row', 4, '8', '50 kg', 90], ['Overhead press', 3, '8–10', '30 kg', 90],
      ['Lat pulldown', 3, '10–12', '45 kg', 60], ['Plank', 3, '45 s', 'Bodyweight', 45],
    ]);
    workout(0, coach, 'Lower body + core', 'Wednesday', 'Legs', 'Go lighter on squats if your knee feels tight.', [
      ['Back squat', 4, '6', '70 kg', 150], ['Romanian deadlift', 3, '8', '60 kg', 120], ['Walking lunge', 3, '10 / leg', '2 × 12 kg', 90],
      ['Leg curl', 3, '12', '30 kg', 60], ['Hanging knee raise', 3, '12', 'Bodyweight', 45],
    ]);
    workout(0, coach, 'Conditioning', 'Friday', 'Cardio', 'Keep heart rate around 140–155.', [
      ['Rower intervals', 6, '250 m', 'Hard', 60], ['Kettlebell swing', 4, '15', '16 kg', 60], ['Bike', 1, '15 min', 'Easy', 0],
    ]);
    workout(1, coach, 'Full body A', 'Day 1', 'Full body', 'Focus on form. Film your squat if you can.', [
      ['Goblet squat', 3, '10', '14 kg', 90], ['Dumbbell bench press', 3, '10', '2 × 10 kg', 90], ['Seated cable row', 3, '12', '30 kg', 60],
    ]);
    run("INSERT INTO workout_logs (workout_id, member_id, effort, notes, completed_at) VALUES (?, ?, 4, 'Bench felt strong today', ?)",
      w1a, memberIds[0], at(addDays(today, -2), 19, 10));
    run('UPDATE members SET coach_notes = ? WHERE user_id = ?',
      'Old left-knee strain (2023). Prefers evening sessions. Goal: drop to 80 kg by the next quarter.', memberIds[0]);
  });
  seedDemoLifts();
}

/** Demo strength history so leagues and leaderboards have something to show. Fictional numbers. */
export function seedDemoLifts() {
  // member code → [bodyweight if none logged, [lift, kg, reps][] best sets]
  const plan: Record<string, [number, [LiftKey, number, number][]]> = {
    'M-0001': [82, [['squat', 110, 5], ['bench', 85, 5], ['deadlift', 140, 3], ['ohp', 50, 5], ['pullup', 0, 9]]],
    'M-0002': [62, [['squat', 60, 5], ['bench', 35, 6], ['deadlift', 75, 5], ['pullup', 0, 2]]],
    'M-0003': [91, [['squat', 160, 3], ['bench', 120, 3], ['deadlift', 200, 2], ['ohp', 75, 3], ['pullup', 10, 8]]],
    'M-0004': [58, [['squat', 70, 5], ['deadlift', 90, 3], ['bench', 40, 5]]],
    'M-0005': [70, [['squat', 80, 8], ['bench', 70, 5], ['pullup', 0, 12]]],
    'M-0006': [68, [['squat', 85, 5], ['bench', 47.5, 5], ['deadlift', 110, 3], ['ohp', 35, 5]]],
    'M-0008': [55, [['squat', 45, 8], ['bench', 25, 8]]],
    'M-0009': [76, [['bench', 60, 8], ['squat', 90, 5]]],
    'M-0011': [77, [['squat', 140, 3], ['bench', 100, 2], ['deadlift', 180, 1], ['ohp', 62.5, 3], ['pullup', 0, 15]]],
  };
  const today = localDate();
  for (const [code, [bw, lifts]] of Object.entries(plan)) {
    const m = get<{ id: number }>('SELECT user_id AS id FROM members WHERE member_code = ?', code);
    if (!m) continue;
    if (!get('SELECT 1 FROM body_stats WHERE member_id = ? AND weight_kg IS NOT NULL', m.id)) {
      run('INSERT INTO body_stats (member_id, recorded_on, weight_kg, recorded_by) VALUES (?, ?, ?, ?)', m.id, addDays(today, -20), bw, m.id);
    }
    for (const [exercise, kg, reps] of lifts) {
      // Three sessions over six weeks, building up to the best set.
      [0.85, 0.93, 1].forEach((f, i) => {
        const weight = exercise === 'pullup' ? kg : Math.round((kg * f) / 2.5) * 2.5;
        const r = exercise === 'pullup' ? Math.max(1, Math.round(reps * f)) : reps;
        logLift(m.id, { exercise, weight_kg: weight, reps: r, performed_on: addDays(today, -40 + i * 18) }, m.id);
      });
    }
  }
  seedDemoCoachLifts();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  migrate();
  if (process.argv.includes('--reset')) {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of ['workout_logs', 'workout_exercises', 'workouts', 'body_stats', 'payments', 'attendance', 'walkins',
      'memberships', 'plans', 'members', 'sessions', 'audit_log', 'settings', 'users']) db.exec(`DELETE FROM ${t}`);
    db.exec('PRAGMA foreign_keys = ON');
  }
  seedDemo();
  console.log('Demo data loaded.');
}

/** Demo coaches are lifters too: fictional numbers for the coaches' strength board. */
export function seedDemoCoachLifts() {
  const coaches: [string, 'Male' | 'Female', number, [LiftKey, number, number][]][] = [
    ['coach', 'Male', 84, [['squat', 170, 3], ['bench', 120, 3], ['deadlift', 210, 2], ['ohp', 75, 3], ['pullup', 15, 8]]],
    ['dana', 'Female', 63, [['squat', 105, 3], ['bench', 62.5, 3], ['deadlift', 130, 2], ['ohp', 42.5, 3], ['pullup', 0, 9]]],
  ];
  const today = localDate();
  for (const [username, gender, bw, lifts] of coaches) {
    const u = get<{ id: number }>("SELECT id FROM users WHERE username = ? AND role = 'coach'", username);
    if (!u || get('SELECT 1 FROM lift_logs WHERE member_id = ?', u.id)) continue;
    run('UPDATE users SET gender = ? WHERE id = ?', gender, u.id);
    run('INSERT INTO body_stats (member_id, recorded_on, weight_kg, recorded_by) VALUES (?, ?, ?, ?)', u.id, addDays(today, -15), bw, u.id);
    for (const [exercise, kg, reps] of lifts) {
      [0.92, 1].forEach((f, i) => {
        const weight = exercise === 'pullup' ? kg : Math.round((kg * f) / 2.5) * 2.5;
        logLift(u.id, { exercise, weight_kg: weight, reps, performed_on: addDays(today, -30 + i * 20) }, u.id);
      });
    }
  }
}
