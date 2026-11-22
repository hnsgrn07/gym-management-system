import { ArrowRight, Info, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useConfirm } from '../../components/confirm';
import {
  LeagueBadge, LeagueHero, LeagueLadder, LeagueName, LiftForm, LiftList, RankChip, StrengthBreakdown, LIFT_NAMES,
} from '../../components/ranking';
import { Button, LinkButton, LoadingRows, PageHeader, Panel, QueryError, SelectField, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { League, LiftLog, RankEntry, Strength } from '../../lib/types';

interface CoachRanksData {
  coaching: {
    points: number; visits: number; prs: number; done: number; built: number; active: number; members: number;
    league: League; rules: { member_visit: number; member_pr: number; workout_done: number; workout_built: number; active_member: number };
  } | null;
  coaching_rank: RankEntry | null;
  lifter: Strength;
  lifter_rank: RankEntry | null;
  gender: string | null;
  recent_lifts: LiftLog[];
}

function LifterProfile({ gender, bodyweight }: { gender: string | null; bodyweight: number | null }) {
  const [g, setG] = useState(gender ?? '');
  const [w, setW] = useState(bodyweight ? String(bodyweight) : '');
  useEffect(() => { setG(gender ?? ''); setW(bodyweight ? String(bodyweight) : ''); }, [gender, bodyweight]);
  const confirm = useConfirm();
  const [save, saving] = useAction(() => api('/coach/me/lifter', { method: 'PUT', body: { gender: g, weight_kg: w && Number(w) !== bodyweight ? Number(w) : null } }), {
    success: 'Lifter profile saved', invalidate: ['/coach/me', '/leaderboard'],
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const changes = [
      g !== (gender ?? '') && `Standards: ${g || 'not specified'}`,
      w && Number(w) !== bodyweight && `Bodyweight: ${bodyweight ?? '—'} → ${w} kg`,
    ].filter(Boolean) as string[];
    if (!changes.length) return;
    if (await confirm({ title: 'Update your lifter profile?', description: <><ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{changes.map((c) => <li key={c}>{c}</li>)}</ul>Your lifter score and league are recalculated.</>, confirmLabel: 'Save' })) void save();
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <SelectField label="Score me on" value={g} onChange={(e) => setG(e.target.value)}>
          <option value="">Mixed standards</option>
          <option value="Male">Men’s standards</option>
          <option value="Female">Women’s standards</option>
        </SelectField>
        <TextField label="Bodyweight" unit="kg" type="number" inputMode="decimal" step="0.1" value={w} onChange={(e) => setW(e.target.value)} />
      </div>
      <div className="form-actions"><Button type="submit" icon={Save} loading={saving}>Save</Button></div>
    </form>
  );
}

export default function CoachRanks() {
  useTitle('My ranks');
  const confirm = useConfirm();
  const [how, setHow] = useState(false);
  const { data, error, refetch } = useApi<CoachRanksData>('/coach/me/ranks');
  const [remove] = useAction((id: number) => api(`/coach/me/lifts/${id}`, { method: 'DELETE' }), { success: 'Lift deleted', invalidate: ['/coach/me', '/leaderboard'] });

  if (error) return <main className="content"><QueryError error={error} retry={refetch} /></main>;
  if (!data) return <main className="content"><Panel><LoadingRows rows={5} /></Panel></main>;
  const c = data.coaching;

  return (
    <main className="content">
      <PageHeader title="My ranks" description="Your coaching league comes from how your members are doing. Your lifter league comes from your own lifts."
        actions={<LinkButton to="/leaderboard?group=coaches" icon={ArrowRight}>Coaches’ leaderboard</LinkButton>} />

      <div className="grid grid-main">
        <div className="stack">
          <Panel title="Coaching league" description="Last 30 days"
            actions={<button className="btn btn-sm btn-ghost" onClick={() => setHow((v) => !v)} aria-expanded={how}><Info size={16} /> How it works</button>}>
            {c ? (
              <div className="stack">
                <div className="league-hero">
                  <LeagueBadge league={c.league} size={88} />
                  <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
                    <div className="league-title"><LeagueName league={c.league} /></div>
                    <div className="row" style={{ gap: 'var(--s2)' }}>
                      <span className="score-num">{c.points}</span>
                      <span className="subtle">coaching points · {c.members} {c.members === 1 ? 'member' : 'members'} coached</span>
                    </div>
                    {c.league.next ? (
                      <>
                        <div className="league-track"><span className={`lg-fill lg-${c.league.key}`} style={{ width: `${c.league.progress}%` }} /></div>
                        <span className="subtle">{c.league.next.needed} points to <strong>{c.league.next.name}</strong></span>
                      </>
                    ) : <span className="subtle">Top coaching league.</span>}
                  </div>
                </div>
                <LeagueLadder current={c.league} />
                <dl className="details">
                  <dt>Member visits</dt><dd className="tabular">{c.visits} × {c.rules.member_visit} = {c.visits * c.rules.member_visit}</dd>
                  <dt>Member PRs</dt><dd className="tabular">{c.prs} × {c.rules.member_pr} = {c.prs * c.rules.member_pr}</dd>
                  <dt>Workouts completed</dt><dd className="tabular">{c.done} × {c.rules.workout_done} = {c.done * c.rules.workout_done}</dd>
                  <dt>Workouts built</dt><dd className="tabular">{c.built} × {c.rules.workout_built} = {c.built * c.rules.workout_built}</dd>
                  <dt>Active members</dt><dd className="tabular">{c.active} × {c.rules.active_member} = {c.active * c.rules.active_member}</dd>
                </dl>
                {how && (
                  <p className="subtle">
                    Your members count toward you while you’re their coach. Completed workouts count for the coach who wrote them.
                    The league uses the last 30 days so it reflects your current impact; the leaderboard also has This month and All time.
                  </p>
                )}
              </div>
            ) : <p className="muted">Coaching rankings are for coach accounts.</p>}
          </Panel>

          <div className="rank-chips" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <RankChip label="Coaching this month" rank={data.coaching_rank?.rank} />
            <RankChip label="Coaches’ strength" rank={data.lifter_rank?.rank} />
          </div>

          <Panel title="Lifter league">
            <div className="stack">
              <LeagueHero strength={data.lifter} />
            </div>
          </Panel>
          <Panel title="Your lifts by score" bodyClass={null}><StrengthBreakdown lifts={data.lifter.lifts} /></Panel>
          <Panel title="Your lift history" bodyClass={null}>
            <LiftList lifts={data.recent_lifts} canDelete={() => true} onDelete={async (l) => {
              if (await confirm({ title: `Delete this ${LIFT_NAMES[l.exercise].toLowerCase()}?`, description: 'Your lifter score is recalculated without it.', confirmLabel: 'Delete lift', tone: 'danger' })) void remove(l.id);
            }} />
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Log your own lift" description="Shows on the coaches’ strength board.">
            <LiftForm endpoint="/coach/me/lifts" invalidate={['/coach/me', '/leaderboard']} />
          </Panel>
          <Panel title="Lifter profile" description="Used to score your lifts against bodyweight.">
            <LifterProfile gender={data.gender} bodyweight={data.lifter.bodyweight} />
          </Panel>
        </div>
      </div>
    </main>
  );
}
