import { ArrowRight, Info } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../components/confirm';
import {
  LeagueHero, LeagueLadder, LiftForm, LiftList, RankChip, StrengthBreakdown, StreakWidget, LIFT_NAMES,
} from '../../components/ranking';
import { Checkbox, LinkButton, LoadingRows, PageHeader, Panel, QueryError } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { LiftLog, Strength, Streak } from '../../lib/types';

interface Ranks {
  strength: Strength;
  points: { visits: number; workouts: number; prs: number; points: number; rank: number | null; of: number; rules: { visit: number; workout: number; pr: number } };
  strength_rank: { rank: number; of: number } | null;
  streak_rank: { rank: number; of: number } | null;
  streak: Streak;
  show_on_leaderboard: boolean;
  recent_lifts: LiftLog[];
}

export default function MemberRanks() {
  useTitle('Ranks');
  const { user } = useAuth();
  const confirm = useConfirm();
  const { data, error, refetch } = useApi<Ranks>('/member/ranks');
  const [howOpen, setHowOpen] = useState(false);
  const [toggle] = useAction((show: boolean) => api('/member/leaderboard', { method: 'PATCH', body: { show } }), {
    success: 'Leaderboard visibility updated', invalidate: ['/member', '/leaderboard'],
  });
  const [remove] = useAction((id: number) => api(`/member/lifts/${id}`, { method: 'DELETE' }), { success: 'Lift deleted', invalidate: ['/member', '/leaderboard'] });

  if (error) return <main className="content"><QueryError error={error} retry={refetch} /></main>;
  if (!data) return <main className="content"><Panel><LoadingRows rows={5} /></Panel></main>;
  const p = data.points;

  return (
    <main className="content">
      <PageHeader title="Ranks" description="Your league is based on your strength. Your gym points come from showing up and putting in the work."
        actions={<LinkButton to="/leaderboard" icon={ArrowRight}>Leaderboard</LinkButton>} />

      <div className="grid grid-main">
        <div className="stack">
          <Panel>
            <div className="stack">
              <LeagueHero strength={data.strength} />
              <LeagueLadder current={data.strength.league} />
            </div>
          </Panel>

          <div className="rank-chips">
            <RankChip label="Gym points this month" rank={p.rank} of={p.of} />
            <RankChip label="Strength" rank={data.strength_rank?.rank} of={data.strength_rank?.of} />
            <RankChip label="Streak" rank={data.streak_rank?.rank} of={data.streak_rank?.of} />
          </div>

          <Panel title="Strength by lift" description={data.strength.bodyweight ? `Scored against your bodyweight (${data.strength.bodyweight} kg). Your league is the average.` : 'Log your bodyweight on Progress to get scored.'} bodyClass={null}>
            <StrengthBreakdown lifts={data.strength.lifts} />
          </Panel>

          <Panel title="Your lifts" bodyClass={null}>
            <LiftList lifts={data.recent_lifts} canDelete={(l) => l.recorded_by === user?.id}
              onDelete={async (l) => {
                if (await confirm({ title: `Delete this ${LIFT_NAMES[l.exercise].toLowerCase()}?`, description: 'Your league and points are recalculated without it.', confirmLabel: 'Delete lift', tone: 'danger' })) void remove(l.id);
              }} />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Log a lift" description="Every new personal record earns 25 points.">
            <LiftForm endpoint="/member/lifts" invalidate={['/member', '/leaderboard']} />
          </Panel>

          <Panel title="Streak"><StreakWidget streak={data.streak} /></Panel>

          <Panel title="Gym points this month" actions={<button className="btn btn-sm btn-ghost" onClick={() => setHowOpen((o) => !o)} aria-expanded={howOpen}><Info size={16} /> How it works</button>}>
            <div className="stack">
              <div className="row" style={{ alignItems: 'baseline' }}><span className="score-num" style={{ fontSize: '2.6rem' }}>{p.points}</span><span className="subtle">points</span></div>
              <dl className="details">
                <dt>Visits</dt><dd className="tabular">{p.visits} × {p.rules.visit} = {p.visits * p.rules.visit}</dd>
                <dt>Workouts done</dt><dd className="tabular">{p.workouts} × {p.rules.workout} = {p.workouts * p.rules.workout}</dd>
                <dt>Personal records</dt><dd className="tabular">{p.prs} × {p.rules.pr} = {p.prs * p.rules.pr}</dd>
              </dl>
              {howOpen && (
                <p className="subtle">
                  Points reset on the 1st of each month. You earn {p.rules.visit} for each day you visit, {p.rules.workout} for each coach workout you mark done,
                  and {p.rules.pr} for each lift that beats your previous best. Leagues are separate: they only move when you get stronger.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Privacy">
            <Checkbox label="Show me on the gym leaderboard" checked={data.show_on_leaderboard}
              hint="When off, other members can’t see you. You still see your own rank, and staff can still see your progress."
              onChange={(e) => void toggle(e.target.checked)} />
          </Panel>
        </div>
      </div>
    </main>
  );
}
