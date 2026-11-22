import { all, get, run, tx } from '../db.ts';
import { HttpError, localDate, localDateTime } from '../util.ts';
import { memberCoverage } from './membership.ts';
import { getSettings } from './settings.ts';

type Source = 'desk' | 'self';

/**
 * Sessions left open from a previous day ("forgot to time out") are closed
 * at 23:59:59 of their own day and flagged, so today's "inside" list stays honest.
 */
export function closeStaleSessions() {
  run(
    `UPDATE attendance SET time_out = date || ' 23:59:59', auto_closed = 1
      WHERE time_out IS NULL AND date < ?`,
    localDate(),
  );
}

/**
 * Actions queued while offline are replayed with the time they actually happened.
 * Accept it only within the last 48 hours and never in the future.
 */
export function resolveTime(at?: string | null): string {
  if (!at) return localDateTime();
  const parsed = new Date(at.replace(' ', 'T'));
  const now = Date.now();
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'Invalid time.');
  if (parsed.getTime() > now + 2 * 60_000) return localDateTime();
  if (parsed.getTime() < now - 48 * 3_600_000) throw new HttpError(400, 'Queued entry is older than 48 hours and was not saved.');
  return localDateTime(parsed);
}

export interface OpenSession {
  id: number;
  time_in: string;
  date: string;
}

export function openSessionForMember(memberId: number): OpenSession | undefined {
  closeStaleSessions();
  return get<OpenSession>(
    'SELECT id, time_in, date FROM attendance WHERE member_id = ? AND time_out IS NULL ORDER BY time_in DESC LIMIT 1',
    memberId,
  );
}

export function checkInMember(memberId: number, opts: { source: Source; by: number; force?: boolean; at?: string }) {
  return tx(() => {
    const member = get<{ full_name: string; active: number }>(
      "SELECT full_name, active FROM users WHERE id = ? AND role = 'member'",
      memberId,
    );
    if (!member) throw new HttpError(404, 'Member not found.');
    if (!member.active) throw new HttpError(403, 'This member account is deactivated.', 'ACCOUNT_INACTIVE');
    const open = openSessionForMember(memberId);
    if (open) throw new HttpError(409, `${member.full_name} is already timed in.`, 'ALREADY_IN');

    const coverage = memberCoverage(memberId);
    const allowed = coverage.status === 'active' || coverage.status === 'expiring';
    if (!allowed && !opts.force) {
      const reason =
        coverage.status === 'none'
          ? `${member.full_name} has no membership yet.`
          : coverage.status === 'pending'
            ? `${member.full_name}'s membership hasn't started yet.`
            : `${member.full_name}'s membership has expired.`;
      throw new HttpError(402, reason, 'MEMBERSHIP_INACTIVE');
    }
    const time = resolveTime(opts.at);
    const r = run(
      'INSERT INTO attendance (member_id, date, time_in, source, recorded_by) VALUES (?, ?, ?, ?, ?)',
      memberId, time.slice(0, 10), time, opts.source, opts.by,
    );
    return { attendance_id: r.id, time_in: time, name: member.full_name, ...coverage };
  });
}

export function checkOut(attendanceId: number, at?: string) {
  return tx(() => {
    const row = get<{ id: number; time_in: string; time_out: string | null }>(
      'SELECT id, time_in, time_out FROM attendance WHERE id = ?',
      attendanceId,
    );
    if (!row) throw new HttpError(404, 'Attendance entry not found.');
    if (row.time_out) throw new HttpError(409, 'Already timed out.', 'ALREADY_OUT');
    let time = resolveTime(at);
    if (time < row.time_in) time = row.time_in;
    run('UPDATE attendance SET time_out = ? WHERE id = ?', time, attendanceId);
    return { attendance_id: attendanceId, time_in: row.time_in, time_out: time };
  });
}

/** Register (or reuse, by phone) a walk-in, time them in, and optionally record the day fee. */
export function checkInWalkin(opts: {
  fullName: string;
  phone?: string | null;
  source: Source;
  by: number | null;
  paid: boolean;
  method?: 'cash' | 'card' | 'ewallet' | 'bank' | 'other';
  at?: string;
}) {
  return tx(() => {
    closeStaleSessions();
    const phone = opts.phone?.trim() || null;
    let walkin = phone
      ? get<{ id: number; full_name: string }>('SELECT id, full_name FROM walkins WHERE phone = ? ORDER BY id DESC LIMIT 1', phone)
      : undefined;
    if (walkin) {
      const open = get<{ id: number }>('SELECT id FROM attendance WHERE walkin_id = ? AND time_out IS NULL', walkin.id);
      if (open) throw new HttpError(409, `${walkin.full_name} is already timed in.`, 'ALREADY_IN');
      if (walkin.full_name !== opts.fullName) run('UPDATE walkins SET full_name = ? WHERE id = ?', opts.fullName, walkin.id);
    } else {
      const r = run('INSERT INTO walkins (full_name, phone) VALUES (?, ?)', opts.fullName, phone);
      walkin = { id: r.id, full_name: opts.fullName };
    }
    const time = resolveTime(opts.at);
    const a = run(
      'INSERT INTO attendance (walkin_id, date, time_in, source, recorded_by) VALUES (?, ?, ?, ?, ?)',
      walkin.id, time.slice(0, 10), time, opts.source, opts.by,
    );
    const fee = getSettings().walkin_fee;
    if (opts.paid) {
      run(
        `INSERT INTO payments (kind, amount, method, walkin_id, attendance_id, note, received_by)
         VALUES ('walkin', ?, ?, ?, ?, 'Walk-in day pass', ?)`,
        fee, opts.method ?? 'cash', walkin.id, a.id, opts.by,
      );
    }
    return { attendance_id: a.id, walkin_id: walkin.id, name: opts.fullName, time_in: time, fee, paid: opts.paid };
  });
}

export function collectWalkinFee(attendanceId: number, method: 'cash' | 'card' | 'ewallet' | 'bank' | 'other', by: number) {
  return tx(() => {
    const row = get<{ walkin_id: number | null }>('SELECT walkin_id FROM attendance WHERE id = ?', attendanceId);
    if (!row?.walkin_id) throw new HttpError(404, 'Walk-in visit not found.');
    const paid = get<{ n: number }>('SELECT COUNT(*) AS n FROM payments WHERE attendance_id = ?', attendanceId);
    if (paid && paid.n > 0) throw new HttpError(409, 'This visit is already paid.', 'ALREADY_PAID');
    const fee = getSettings().walkin_fee;
    run(
      `INSERT INTO payments (kind, amount, method, walkin_id, attendance_id, note, received_by)
       VALUES ('walkin', ?, ?, ?, ?, 'Walk-in day pass', ?)`,
      fee, method, row.walkin_id, attendanceId, by,
    );
    return { attendance_id: attendanceId, amount: fee };
  });
}

export interface InsideRow {
  id: number;
  time_in: string;
  member_id: number | null;
  walkin_id: number | null;
  name: string;
  member_code: string | null;
  phone: string | null;
  paid: number;
  source: string;
}

export function insideNow(): InsideRow[] {
  closeStaleSessions();
  return all<InsideRow>(
    `SELECT a.id, a.time_in, a.member_id, a.walkin_id, a.source,
            COALESCE(u.full_name, w.full_name) AS name, m.member_code, COALESCE(u.phone, w.phone) AS phone,
            CASE WHEN a.walkin_id IS NULL THEN 1
                 ELSE EXISTS (SELECT 1 FROM payments p WHERE p.attendance_id = a.id) END AS paid
       FROM attendance a
       LEFT JOIN users u ON u.id = a.member_id
       LEFT JOIN members m ON m.user_id = a.member_id
       LEFT JOIN walkins w ON w.id = a.walkin_id
      WHERE a.time_out IS NULL
      ORDER BY a.time_in DESC`,
  );
}

export function attendanceForDate(date: string) {
  return all(
    `SELECT a.id, a.date, a.time_in, a.time_out, a.auto_closed, a.source, a.member_id, a.walkin_id,
            COALESCE(u.full_name, w.full_name) AS name, m.member_code,
            CASE WHEN a.walkin_id IS NULL THEN 1
                 ELSE EXISTS (SELECT 1 FROM payments p WHERE p.attendance_id = a.id) END AS paid,
            r.full_name AS recorded_by_name
       FROM attendance a
       LEFT JOIN users u ON u.id = a.member_id
       LEFT JOIN members m ON m.user_id = a.member_id
       LEFT JOIN walkins w ON w.id = a.walkin_id
       LEFT JOIN users r ON r.id = a.recorded_by
      WHERE a.date = ?
      ORDER BY a.time_in DESC`,
    date,
  );
}
