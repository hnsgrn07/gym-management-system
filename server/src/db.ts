import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH ?? path.resolve(import.meta.dirname, '../data/gym.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

/**
 * Ordered migrations. Each entry runs once; PRAGMA user_version records progress.
 * Append new migrations to the end. Never edit one that has shipped.
 */
const migrations: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('admin','clerk','coach','member')),
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE members (
    user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    member_code       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    birthdate         TEXT,
    gender            TEXT,
    emergency_contact TEXT,
    goal              TEXT,
    coach_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    coach_notes       TEXT
  );

  CREATE TABLE plans (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    price         REAL NOT NULL CHECK (price >= 0),
    description   TEXT,
    active        INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE memberships (
    id         INTEGER PRIMARY KEY,
    member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id    INTEGER NOT NULL REFERENCES plans(id),
    start_date TEXT NOT NULL,
    end_date   TEXT NOT NULL,
    price_paid REAL NOT NULL,
    cancelled  INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_memberships_member ON memberships(member_id, end_date);

  CREATE TABLE walkins (
    id         INTEGER PRIMARY KEY,
    full_name  TEXT NOT NULL,
    phone      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_walkins_phone ON walkins(phone);

  CREATE TABLE attendance (
    id          INTEGER PRIMARY KEY,
    member_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    walkin_id   INTEGER REFERENCES walkins(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    time_in     TEXT NOT NULL,
    time_out    TEXT,
    auto_closed INTEGER NOT NULL DEFAULT 0,
    source      TEXT NOT NULL DEFAULT 'desk' CHECK (source IN ('desk','self','kiosk')),
    recorded_by INTEGER REFERENCES users(id),
    CHECK ((member_id IS NULL) <> (walkin_id IS NULL))
  );
  CREATE INDEX idx_attendance_date ON attendance(date);
  CREATE INDEX idx_attendance_member ON attendance(member_id, date);
  CREATE INDEX idx_attendance_open ON attendance(time_out) WHERE time_out IS NULL;

  CREATE TABLE payments (
    id            INTEGER PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('membership','walkin','other')),
    amount        REAL NOT NULL CHECK (amount >= 0),
    method        TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','card','ewallet','bank','other')),
    member_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    walkin_id     INTEGER REFERENCES walkins(id) ON DELETE SET NULL,
    membership_id INTEGER REFERENCES memberships(id) ON DELETE SET NULL,
    attendance_id INTEGER REFERENCES attendance(id) ON DELETE SET NULL,
    note          TEXT,
    received_by   INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_payments_created ON payments(created_at);

  CREATE TABLE body_stats (
    id           INTEGER PRIMARY KEY,
    member_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recorded_on  TEXT NOT NULL,
    weight_kg    REAL,
    height_cm    REAL,
    body_fat_pct REAL,
    muscle_pct   REAL,
    waist_cm     REAL,
    chest_cm     REAL,
    hips_cm      REAL,
    arm_cm       REAL,
    thigh_cm     REAL,
    resting_hr   INTEGER,
    notes        TEXT,
    recorded_by  INTEGER REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_stats_member ON body_stats(member_id, recorded_on);

  CREATE TABLE workouts (
    id         INTEGER PRIMARY KEY,
    member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title      TEXT NOT NULL,
    day_label  TEXT,
    focus      TEXT,
    notes      TEXT,
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_workouts_member ON workouts(member_id, status);

  CREATE TABLE workout_exercises (
    id         INTEGER PRIMARY KEY,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,
    name       TEXT NOT NULL,
    sets       INTEGER,
    reps       TEXT,
    load       TEXT,
    rest_sec   INTEGER,
    notes      TEXT
  );
  CREATE INDEX idx_exercises_workout ON workout_exercises(workout_id, position);

  CREATE TABLE workout_logs (
    id           INTEGER PRIMARY KEY,
    workout_id   INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    member_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    effort       INTEGER CHECK (effort BETWEEN 1 AND 5),
    notes        TEXT
  );
  CREATE INDEX idx_logs_member ON workout_logs(member_id, completed_at);

  CREATE TABLE sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    details    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_audit_created ON audit_log(created_at);
  `,
  // 2: walk-ins can be converted into members; their past visits move to the member record.
  `
  ALTER TABLE walkins ADD COLUMN converted_member_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE attendance ADD COLUMN was_walkin INTEGER NOT NULL DEFAULT 0;
  `,
  // 3: strength lifts (for leagues and rankings) and leaderboard visibility.
  `
  CREATE TABLE lift_logs (
    id            INTEGER PRIMARY KEY,
    member_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise      TEXT NOT NULL CHECK (exercise IN ('squat','bench','deadlift','ohp','pullup')),
    weight_kg     REAL NOT NULL CHECK (weight_kg >= 0),
    reps          INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 50),
    e1rm          REAL NOT NULL,
    is_pr         INTEGER NOT NULL DEFAULT 0,
    performed_on  TEXT NOT NULL,
    notes         TEXT,
    recorded_by   INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_lifts_member ON lift_logs(member_id, exercise, e1rm);
  ALTER TABLE members ADD COLUMN show_on_leaderboard INTEGER NOT NULL DEFAULT 1;
  `,
  // 4: coaches can be ranked as lifters too, so staff accounts get an optional gender.
  `
  ALTER TABLE users ADD COLUMN gender TEXT;
  `,
];

export function migrate() {
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = user_version; v < migrations.length; v++) {
    tx(() => {
      db.exec(migrations[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

type Param = string | number | bigint | null | undefined | boolean;
const norm = (params: Param[]) =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

const cache = new Map<string, StatementSync>();
function stmt(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  return stmt(sql).all(...norm(params)) as T[];
}

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return stmt(sql).get(...norm(params)) as T | undefined;
}

export function run(sql: string, ...params: Param[]): { changes: number; id: number } {
  const r = stmt(sql).run(...norm(params));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

let depth = 0;
/** Run fn atomically. Nested calls join the outer transaction. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export function audit(userId: number | null | undefined, action: string, details?: string) {
  run('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)', userId ?? null, action, details ?? null);
}
