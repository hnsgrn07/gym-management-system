import { ArrowRight, CalendarCheck, Dumbbell, Flame, Scale } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Empty, Facts, LinkButton, Notice, PageHeader, Panel, QueryError, Skeleton, StatusPill } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { bmiCategory, fmtDate, fmtDateTime, greeting, localDateTime, WEEKDAYS } from '../../lib/format';
import { useApi, useTitle } from '../../lib/hooks';
import type { Member, Stat, Workout, WorkoutLog } from '../../lib/types';
import { TimeClock } from './shared';

interface Overview {
  profile: Member;
  open_session: { id: number; time_in: string } | null;
  visits: { this_month: number; total_visits: number; week_streak: number };
  latest_stats: Stat | null;
  previous_stats: Stat | null;
  workouts: Workout[];
  recent_logs: WorkoutLog[];
}

/** Pick today's workout: one labelled with today's weekday, otherwise the one done least recently. */
export function pickTodayWorkout(workouts: Workout[]) {
  const today = WEEKDAYS[new Date().getDay()].toLowerCase();
  return (
    workouts.find((w) => w.day_label?.toLowerCase() === today) ??
    [...workouts].sort((a, b) => (a.last_done ?? '').localeCompare(b.last_done ?? ''))[0]
  );
}

export default function MemberToday() {
  const { user } = useAuth();
  useTitle('Today');
  const { data, error, refetch, isLoading } = useApi<Overview>('/member/overview', { refetchInterval: 60_000 });
  // Shown while a time in/out is waiting to sync.
  const [optimistic, setOptimistic] = useState<{ open: { id: number; time_in: string } | null } | null>(null);

  if (error) return <main className="content"><QueryError error={error} retry={refetch} /></main>;

  const p = data?.profile;
  const open = optimistic ? optimistic.open : data?.open_session ?? null;
  const latest = data?.latest_stats;
  const prev = data?.previous_stats;
  const weightDelta = latest?.weight_kg && prev?.weight_kg ? Math.round((latest.weight_kg - prev.weight_kg) * 10) / 10 : null;
  const today = data ? pickTodayWorkout(data.workouts) : undefined;
  const bmi = bmiCategory(latest?.bmi);

  return (
    <main className="content">
      <PageHeader title={`${greeting()}, ${user?.full_name.split(' ')[0]}`} description={p ? `Member ${p.member_code}${p.coach_name ? ` · Coach ${p.coach_name}` : ''}` : undefined} />

      {p?.status === 'expiring' && (
        <Notice tone="warn" title={`Your membership ends ${fmtDate(p.paid_through)}`}>Renew at the front desk to keep training without a gap.</Notice>
      )}

      <div className="grid grid-main">
        <div className="stack">
          <Panel title="Time in / out" actions={p && <StatusPill status={p.status} daysLeft={p.days_left} />}>
            {isLoading || !p ? <Skeleton h={120} /> : (
              <TimeClock open={open} status={p.status}
                onQueued={(a) => setOptimistic({ open: a === 'in' ? { id: -1, time_in: localDateTime() } : null })} />
            )}
          </Panel>

          <Panel title="Today’s workout" actions={<LinkButton to="/member/workouts" size="sm" variant="ghost">All workouts <ArrowRight size={16} /></LinkButton>} bodyClass={null}>
            {isLoading ? <div className="panel-body"><Skeleton h={100} /></div> : today ? (
              <>
                <div className="panel-body tight">
                  <div className="workout-head">
                    <div>
                      {today.day_label && <div className="day-tag">{today.day_label}{today.focus ? ` · ${today.focus}` : ''}</div>}
                      <h3>{today.title}</h3>
                    </div>
                    <span className="subtle">{today.exercises.length} exercises</span>
                  </div>
                </div>
                <ul className="list">
                  {today.exercises.slice(0, 5).map((e, i) => (
                    <li key={i} style={{ minHeight: 52 }}>
                      <span className="grow"><strong>{e.name}</strong></span>
                      <span className="muted tabular">{[e.sets && `${e.sets} ×`, e.reps, e.load && `@ ${e.load}`].filter(Boolean).join(' ')}</span>
                    </li>
                  ))}
                </ul>
                <div className="panel-foot"><LinkButton to={`/member/workouts#w${today.id}`} variant="primary" size="sm" icon={Dumbbell}>Open workout</LinkButton></div>
              </>
            ) : (
              <Empty icon={Dumbbell} title="No workouts yet">
                {p?.coach_name ? `${p.coach_name} hasn’t assigned a workout yet.` : 'Ask the front desk to pair you with a coach for a custom program.'}
              </Empty>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Facts items={[
            { label: <><CalendarCheck size={15} /> Visits this month</>, value: data?.visits.this_month ?? '–', note: data ? `${data.visits.total_visits} all time` : undefined },
            { label: <><Flame size={15} /> Week streak</>, value: data ? `${data.visits.week_streak} wk` : '–', note: 'Weeks in a row with a visit' },
          ]} />

          <Panel title="Body stats" actions={<LinkButton to="/member/progress" size="sm" variant="ghost">Progress <ArrowRight size={16} /></LinkButton>}>
            {latest ? (
              <dl className="details">
                <dt>Weight</dt>
                <dd className="tabular">
                  {latest.weight_kg ? `${latest.weight_kg} kg` : '—'}
                  {weightDelta !== null && weightDelta !== 0 && <span className="subtle"> ({weightDelta > 0 ? '+' : ''}{weightDelta} kg)</span>}
                </dd>
                <dt>BMI</dt>
                <dd className="tabular">{latest.bmi ?? '—'} {bmi.label && <span className={`pill ${bmi.tone} plain`} style={{ marginLeft: 6 }}>{bmi.label}</span>}</dd>
                <dt>Body fat</dt><dd className="tabular">{latest.body_fat_pct ? `${latest.body_fat_pct}%` : '—'}</dd>
                <dt>Age</dt><dd>{p?.age ?? <Link to="/account">Add birthdate</Link>}</dd>
                <dt>Last logged</dt><dd>{fmtDate(latest.recorded_on)}</dd>
              </dl>
            ) : (
              <Empty icon={Scale} title="No measurements yet" action={<LinkButton to="/member/progress" variant="primary" size="sm">Log your first</LinkButton>}>
                Log your weight and height to track BMI and progress over time.
              </Empty>
            )}
          </Panel>

          {p && (
            <Panel title="Membership">
              <dl className="details">
                <dt>Status</dt><dd><StatusPill status={p.status} daysLeft={p.days_left} /></dd>
                <dt>Paid through</dt><dd>{fmtDate(p.paid_through)}</dd>
                {data?.recent_logs[0] && <><dt>Last workout</dt><dd>{data.recent_logs[0].title}, {fmtDateTime(data.recent_logs[0].completed_at)}</dd></>}
              </dl>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
