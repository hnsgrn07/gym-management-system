import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Checkbox, Empty, LoadingRows, PageHeader, Panel, QueryError } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { useApi, useTitle } from '../../lib/hooks';

interface Entry { id: number; action: string; details: string | null; created_at: string; full_name: string | null; role: string | null }

const LABELS: Record<string, string> = {
  'auth.login': 'Signed in', 'auth.password_changed': 'Changed their password', 'member.create': 'Registered a member',
  'member.update': 'Edited a member', 'member.password_reset': 'Reset a member’s password', 'membership.sell': 'Sold a membership',
  'attendance.override': 'Timed in without an active membership', 'plan.create': 'Created a plan', 'plan.update': 'Edited a plan',
  'staff.create': 'Added staff', 'staff.update': 'Edited staff', 'user.activate': 'Reactivated an account', 'user.deactivate': 'Deactivated an account',
  'settings.update': 'Changed settings', 'workout.create': 'Created a workout', 'workout.delete': 'Deleted a workout',
  'coach.assign': 'Took on a member', 'coach.unassign': 'Released a member',
};

export default function AdminActivity() {
  useTitle('Activity log');
  const [logins, setLogins] = useState(false);
  const { data, error, refetch } = useApi<Entry[]>(`/admin/audit?logins=${logins ? 1 : 0}`);
  return (
    <main className="content">
      <PageHeader title="Activity log" description="Who did what, and when. Overrides and money-related actions are always recorded." />
      <Checkbox label="Include sign-ins" checked={logins} onChange={(e) => setLogins(e.target.checked)} />
      {error && <QueryError error={error} retry={refetch} />}
      <Panel bodyClass={null}>
        {!data ? <LoadingRows rows={8} /> : data.length ? (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td data-label="When" className="nowrap tabular">{fmtDateTime(e.created_at)}</td>
                    <td data-primary><strong>{e.full_name ?? 'System'}</strong>{e.role && <span className="subtle"> · {e.role}</span>}</td>
                    <td data-label="Action">{LABELS[e.action] ?? e.action}</td>
                    <td data-label="Details" className="muted">{e.details ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={ScrollText} title="No activity yet" />}
      </Panel>
    </main>
  );
}
