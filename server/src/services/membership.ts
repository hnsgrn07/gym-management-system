import { get, run, tx } from '../db.ts';
import { addDays, daysBetween, HttpError, localDate } from '../util.ts';
import { getSettings } from './settings.ts';

export type MembershipStatus = 'active' | 'expiring' | 'expired' | 'pending' | 'none';

/**
 * SQL columns that give a member's coverage. Use with a users alias.
 * paid_through = latest end date; covered = a membership spans today.
 */
export const coverageSql = (alias = 'u') => `
  (SELECT MAX(end_date) FROM memberships WHERE member_id = ${alias}.id AND cancelled = 0) AS paid_through,
  EXISTS (SELECT 1 FROM memberships WHERE member_id = ${alias}.id AND cancelled = 0
           AND start_date <= date('now','localtime') AND end_date >= date('now','localtime')) AS covered`;

export function statusOf(row: { paid_through: string | null; covered: number | boolean }): {
  status: MembershipStatus;
  days_left: number | null;
} {
  const today = localDate();
  if (!row.paid_through) return { status: 'none', days_left: null };
  const daysLeft = daysBetween(today, row.paid_through);
  if (row.covered) {
    return { status: daysLeft <= getSettings().expiring_days ? 'expiring' : 'active', days_left: daysLeft };
  }
  if (row.paid_through >= today) return { status: 'pending', days_left: daysLeft };
  return { status: 'expired', days_left: daysLeft };
}

export function withStatus<T extends { paid_through: string | null; covered: number | boolean }>(row: T) {
  const { covered: _covered, ...rest } = row;
  return { ...rest, ...statusOf(row) };
}

export function memberCoverage(memberId: number) {
  const row = get<{ paid_through: string | null; covered: number }>(
    `SELECT ${coverageSql('u')} FROM users u WHERE u.id = ?`,
    memberId,
  );
  if (!row) throw new HttpError(404, 'Member not found.');
  return statusOf(row);
}

export type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'bank' | 'other';

/**
 * Sell or renew a plan. When the member is still covered (or has a future
 * membership), the new one starts the day after the latest end date so no days are lost.
 */
export function sellMembership(opts: {
  memberId: number;
  planId: number;
  method: PaymentMethod;
  startDate?: string;
  amount?: number;
  byUserId: number;
}) {
  return tx(() => {
    const plan = get<{ id: number; name: string; duration_days: number; price: number; active: number }>(
      'SELECT * FROM plans WHERE id = ?',
      opts.planId,
    );
    if (!plan || !plan.active) throw new HttpError(400, 'That plan is not available.');
    const today = localDate();
    const latest = get<{ end: string | null }>(
      'SELECT MAX(end_date) AS end FROM memberships WHERE member_id = ? AND cancelled = 0',
      opts.memberId,
    )?.end;
    const start = opts.startDate ?? (latest && latest >= today ? addDays(latest, 1) : today);
    const end = addDays(start, plan.duration_days - 1);
    const amount = opts.amount ?? plan.price;
    const ms = run(
      `INSERT INTO memberships (member_id, plan_id, start_date, end_date, price_paid, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      opts.memberId, plan.id, start, end, amount, opts.byUserId,
    );
    run(
      `INSERT INTO payments (kind, amount, method, member_id, membership_id, note, received_by)
       VALUES ('membership', ?, ?, ?, ?, ?, ?)`,
      amount, opts.method, opts.memberId, ms.id, plan.name, opts.byUserId,
    );
    return { membership_id: ms.id, plan_name: plan.name, start_date: start, end_date: end, amount };
  });
}
