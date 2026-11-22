import { EyeOff, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { LeagueBadge, LeagueName } from '../components/ranking';
import { Avatar, Empty, LoadingRows, PageHeader, Panel, QueryError, Segmented, Tabs } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useApi, useTitle } from '../lib/hooks';
import type { RankEntry } from '../lib/types';

type Board = 'points' | 'strength' | 'streak' | 'coaching';
type Group = 'members' | 'coaches';
interface BoardData { board: Board; period: 'month' | 'all'; total: number; entries: RankEntry[]; me: RankEntry | null }

const UNIT: Record<Board, string> = { points: 'pts', strength: 'score', streak: 'weeks', coaching: 'pts' };
const ABOUT: Record<Board, string> = {
  points: 'Points for showing up: visits, completed workouts, and personal records.',
  strength: 'Strength score from your best squat, bench, deadlift, overhead press, and pull-ups, relative to bodyweight.',
  streak: 'Weeks in a row with at least one visit.',
  coaching: 'Coaching points from how each coach’s members are doing: visits, PRs, completed workouts, and active members.',
};
const COACH_STRENGTH = 'Coaches’ own strength score from their best squat, bench, deadlift, overhead press, and pull-ups.';

export default function Leaderboard() {
  useTitle('Leaderboard');
  const { user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const group: Group = params.get('group') === 'coaches' ? 'coaches' : 'members';
  const [board, setBoard] = useState<Board>(group === 'coaches' ? 'coaching' : 'points');
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const switchGroup = (g: Group) => {
    setParams(g === 'coaches' ? { group: 'coaches' } : {}, { replace: true });
    setBoard(g === 'coaches' ? 'coaching' : 'points');
  };
  const { data, error, refetch, isLoading } = useApi<BoardData>(`/leaderboard?group=${group}&board=${board}&period=${period}`, { placeholderData: (p) => p });
  const staff = user?.role !== 'member';
  const clickable = group === 'members' && (user?.role === 'coach' || user?.role === 'admin');
  const open = (e: RankEntry) => {
    if (clickable) nav(`/coach/members/${e.member_id}`);
  };
  const entries = data?.entries ?? [];
  const top = entries.slice(0, 3);
  const meVisible = entries.some((e) => e.is_me);

  return (
    <main className="content">
      <PageHeader title="Leaderboard" description={group === 'coaches' && board === 'strength' ? COACH_STRENGTH : ABOUT[board]}
        actions={<>
          <Segmented<Group> label="Who" value={group} onChange={switchGroup} options={[{ value: 'members', label: 'Members' }, { value: 'coaches', label: 'Coaches' }]} />
          {(board === 'points' || board === 'coaching') && <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'This month' }, { value: 'all', label: 'All time' }]} />}
        </>} />
      <Tabs value={board} onChange={setBoard} tabs={group === 'members'
        ? [{ value: 'points', label: 'Gym points' }, { value: 'strength', label: 'Strength' }, { value: 'streak', label: 'Streaks' }]
        : [{ value: 'coaching', label: 'Coaching' }, { value: 'strength', label: 'Strength' }]} />
      {error && <QueryError error={error} retry={refetch} />}
      <Panel bodyClass={null}>
        {isLoading ? <LoadingRows rows={6} /> : !entries.length ? (
          <Empty icon={Trophy} title="No one on this board yet">
            {group === 'coaches'
              ? board === 'strength' ? 'Coaches appear here once they log their bodyweight and a lift on My ranks.' : 'Coaches appear here once they have members.'
              : board === 'strength' ? 'Members appear here once they log a lift and their bodyweight.' : 'Members appear here as soon as they start visiting.'}
          </Empty>
        ) : (
          <>
            {top.length >= 3 && (
              <div className="podium" aria-label="Top three">
                {[top[1], top[0], top[2]].map((e, i) => (
                  <div key={e.member_id} className={`podium-spot p${[2, 1, 3][i]}${e.is_me ? ' me' : ''}`} onClick={() => open(e)} style={{ cursor: clickable ? 'pointer' : undefined }}>
                    <LeagueBadge league={e.league} size={[40, 52, 36][i]} />
                    <span className="who">{e.full_name}{e.is_me ? ' (you)' : ''}</span>
                    <span className="val">{e.value} <small className="subtle">{UNIT[board]}</small></span>
                    <div className="podium-block">{e.rank}</div>
                  </div>
                ))}
              </div>
            )}
            <ul className="list" style={{ borderTop: '1px solid var(--border)' }}>
              {entries.map((e) => (
                <li key={e.member_id} className={e.is_me ? 'me-row' : ''} onClick={() => open(e)} style={{ cursor: clickable ? 'pointer' : undefined }}>
                  <div className="board-row" style={{ width: '100%' }}>
                    <span className="board-rank">{e.rank}</span>
                    <div className="cell-person" style={{ minWidth: 0 }}>
                      <Avatar name={e.full_name} />
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{e.full_name}{e.is_me ? ' (you)' : ''} {e.hidden && staff && <EyeOff size={14} aria-label="Hidden from other members" />}</div>
                        <div className="meta"><LeagueName league={e.league} /> · {e.detail}</div>
                      </div>
                    </div>
                    <span className="board-val">{e.value}<small>{UNIT[board]}</small></span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
      {data?.me && !meVisible && (
        <div className="panel my-rank-bar" style={{ padding: 'var(--s3) var(--s5)' }}>
          <div className="board-row">
            <span className="board-rank">{data.me.rank}</span>
            <div><strong>You</strong> <span className="subtle">· hidden from others · {data.me.detail}</span></div>
            <span className="board-val">{data.me.value}<small>{UNIT[board]}</small></span>
          </div>
        </div>
      )}
    </main>
  );
}
