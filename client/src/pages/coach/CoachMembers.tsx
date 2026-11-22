import { Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LeagueBadge, LeagueName } from '../../components/ranking';
import { Avatar, Empty, LoadingRows, PageHeader, Panel, Pill, QueryError, Segmented, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { relativeDay } from '../../lib/format';
import { useApi, useDebounced, useTitle } from '../../lib/hooks';
import type { League, Member } from '../../lib/types';

export default function CoachMembers() {
  useTitle('Members');
  const { user } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>(user?.role === 'coach' ? 'mine' : 'all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const nav = useNavigate();
  const { data, error, refetch, isLoading } = useApi<(Member & { league: League | null; strength_score: number | null })[]>(`/coach/members?scope=${scope}&q=${encodeURIComponent(dq)}`, { placeholderData: (prev) => prev });

  return (
    <main className="content">
      <PageHeader title="Members" description="Open a member to see their stats and attendance, and to build workouts for them." />
      <div className="row-between">
        <Segmented label="Show" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My members' }, { value: 'all', label: 'Everyone' }]} />
        <div className="input-icon" style={{ flex: '1 1 260px', maxWidth: 420 }}>
          <Search size={18} />
          <input className="input" type="search" placeholder="Search by name, code, or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        </div>
      </div>
      {error && <QueryError error={error} retry={refetch} />}
      <Panel bodyClass={null}>
        {isLoading ? <LoadingRows /> : data?.length ? (
          <div className="table-wrap">
            <table className="table responsive">
              <thead><tr><th>Member</th><th>League</th><th>Goal</th><th>Membership</th><th>Last visit</th><th>Coach</th></tr></thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => nav(`/coach/members/${m.id}`)}>
                    <td data-primary>
                      <div className="cell-person">
                        <Avatar name={m.full_name} />
                        <div>
                          <a className="name" href={`/coach/members/${m.id}`} onClick={(e) => { e.preventDefault(); nav(`/coach/members/${m.id}`); }}>{m.full_name}</a>
                          <div className="meta">{m.member_code}{m.age ? ` · ${m.age} yrs` : ''}{m.gender ? ` · ${m.gender}` : ''}</div>
                        </div>
                        {m.inside && <Pill tone="ok">In the gym</Pill>}
                      </div>
                    </td>
                    <td data-label="League"><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><LeagueBadge league={m.league} size={22} /> <LeagueName league={m.league} /></span></td>
                    <td data-label="Goal">{m.goal ?? '—'}</td>
                    <td data-label="Membership"><StatusPill status={m.status} daysLeft={m.days_left} /></td>
                    <td data-label="Last visit">{relativeDay(m.last_visit)}</td>
                    <td data-label="Coach" className="hide-sm">{m.coach_name ?? <span className="subtle">Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Users} title={dq ? 'No members match that search' : scope === 'mine' ? 'You have no members yet' : 'No members yet'}>
            {scope === 'mine' && !dq ? 'Switch to “Everyone”, open a member, and tap “Coach this member” to take them on.' : 'Try a different name, member code, or phone number.'}
          </Empty>
        )}
      </Panel>
    </main>
  );
}
