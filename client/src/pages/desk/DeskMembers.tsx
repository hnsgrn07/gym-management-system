import { Download, Search, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, Empty, LinkButton, LoadingRows, PageHeader, Panel, Pill, QueryError, Segmented, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { fmtDate, relativeDay } from '../../lib/format';
import { useApi, useDebounced, useTitle } from '../../lib/hooks';
import type { Member, MembershipStatus } from '../../lib/types';

type Filter = 'all' | MembershipStatus;

export default function DeskMembers() {
  useTitle('Members');
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const dq = useDebounced(q, 200);
  const { data, error, refetch, isLoading } = useApi<Member[]>(`/desk/members?q=${encodeURIComponent(dq)}`, { placeholderData: (p) => p });
  const count = (s: Filter) => (data ? (s === 'all' ? data.length : data.filter((m) => m.status === s).length) : undefined);
  const rows = (data ?? []).filter((m) => filter === 'all' || m.status === filter);

  return (
    <main className="content">
      <PageHeader title="Members" description="Everyone with a member account."
        actions={<>
          {user?.role === 'admin' && <a className="btn" href="/api/admin/export/members.csv"><Download size={18} /> Export CSV</a>}
          <LinkButton to="/desk/members/new" variant="primary" icon={UserPlus}>New member</LinkButton>
        </>} />
      <div className="row-between">
        <Segmented<Filter> label="Filter by status" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: count('all') },
          { value: 'active', label: 'Active', count: count('active') },
          { value: 'expiring', label: 'Expiring', count: count('expiring') },
          { value: 'expired', label: 'Expired', count: count('expired') },
          { value: 'none', label: 'No plan', count: count('none') },
        ]} />
        <div className="input-icon" style={{ flex: '1 1 260px', maxWidth: 400 }}>
          <Search size={18} />
          <input className="input" type="search" placeholder="Search name, code, phone, email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        </div>
      </div>
      {error && <QueryError error={error} retry={refetch} />}
      <Panel bodyClass={null}>
        {isLoading ? <LoadingRows rows={6} /> : rows.length ? (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Member</th><th>Phone</th><th>Membership</th><th>Paid through</th><th>Last visit</th><th>Coach</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => nav(`/desk/members/${m.id}`)}>
                    <td data-primary>
                      <div className="cell-person">
                        <Avatar name={m.full_name} />
                        <div>
                          <a className="name" href={`/desk/members/${m.id}`} onClick={(e) => { e.preventDefault(); nav(`/desk/members/${m.id}`); }}>{m.full_name}</a>
                          <div className="meta">{m.member_code}{!m.active ? ' · deactivated' : ''}</div>
                        </div>
                        {m.inside && <Pill tone="ok">In</Pill>}
                      </div>
                    </td>
                    <td data-label="Phone">{m.phone ?? '—'}</td>
                    <td data-label="Status"><StatusPill status={m.status} daysLeft={m.days_left} /></td>
                    <td data-label="Until" className="tabular">{fmtDate(m.paid_through)}</td>
                    <td data-label="Last visit" className="hide-sm">{relativeDay(m.last_visit)}</td>
                    <td data-label="Coach" className="hide-sm">{m.coach_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Users} title={dq || filter !== 'all' ? 'No members match' : 'No members yet'}
            action={!dq && filter === 'all' ? <LinkButton to="/desk/members/new" variant="primary" icon={UserPlus}>Register the first member</LinkButton> : undefined}>
            {dq || filter !== 'all' ? 'Try another search or filter.' : 'Members you register appear here.'}
          </Empty>
        )}
      </Panel>
    </main>
  );
}
