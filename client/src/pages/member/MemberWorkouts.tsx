import { CheckCircle2, Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Button, Empty, LoadingRows, PageHeader, Panel, QueryError, TextareaField } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime, relativeDay } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Workout, WorkoutLog } from '../../lib/types';

export function ExerciseTable({ workout }: { workout: Workout }) {
  return (
    <div className="table-wrap">
      <table className="table exercise-table responsive">
        <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Load</th><th>Rest</th></tr></thead>
        <tbody>
          {workout.exercises.map((e, i) => (
            <tr key={i}>
              <td data-primary data-label="Exercise">
                {e.name}
                {e.notes && <div className="subtle" style={{ fontWeight: 400 }}>{e.notes}</div>}
              </td>
              <td data-label="Sets">{e.sets ?? '—'}</td>
              <td data-label="Reps">{e.reps ?? '—'}</td>
              <td data-label="Load">{e.load ?? '—'}</td>
              <td data-label="Rest">{e.rest_sec ? (e.rest_sec >= 60 ? `${Math.round((e.rest_sec / 60) * 10) / 10} min` : `${e.rest_sec} s`) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EFFORT = ['Very easy', 'Easy', 'Moderate', 'Hard', 'Max effort'];

function WorkoutCard({ w }: { w: Workout }) {
  const [logging, setLogging] = useState(false);
  const [effort, setEffort] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [done, busy] = useAction(
    () => api(`/member/workouts/${w.id}/done`, { method: 'POST', body: { effort, notes }, queue: `Workout done: ${w.title}` }),
    { success: 'Workout logged. Great job!', invalidate: ['/member'], onSuccess: () => { setLogging(false); setEffort(null); setNotes(''); } },
  );
  return (
    <Panel id={`w${w.id}`} bodyClass={null}
      title={<>{w.day_label && <div className="day-tag">{w.day_label}{w.focus ? ` · ${w.focus}` : ''}</div>}{w.title}</>}
      description={`${w.coach_name ? `From ${w.coach_name} · ` : ''}${w.times_done ? `Done ${w.times_done}× · last ${relativeDay(w.last_done)}` : 'Not done yet'}`}
      actions={!logging && <Button variant="primary" size="sm" icon={CheckCircle2} onClick={() => setLogging(true)}>Mark as done</Button>}
    >
      {w.notes && <div className="panel-body tight"><p className="muted">{w.notes}</p></div>}
      <ExerciseTable workout={w} />
      {logging && (
        <div className="panel-foot stack">
          <div className="field">
            <span className="field-label">How hard was it?</span>
            <div className="effort" role="group" aria-label="Effort from 1 to 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={effort === n} title={EFFORT[n - 1]} onClick={() => setEffort(effort === n ? null : n)}>{n}</button>
              ))}
            </div>
            <span className="field-hint">{effort ? EFFORT[effort - 1] : '1 = very easy, 5 = max effort'}</span>
          </div>
          <TextareaField label="Notes for your coach" optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bench felt heavy on the last set" />
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setLogging(false)}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => void done()}>Save</Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function MemberWorkouts() {
  useTitle('Workouts');
  const { data, error, refetch, isLoading } = useApi<{ workouts: Workout[]; logs: WorkoutLog[] }>('/member/workouts');
  const { hash } = useLocation();
  useEffect(() => {
    if (hash && data) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, data]);

  return (
    <main className="content">
      <PageHeader title="Workouts" description="Programs your coach built for you. Mark each session done so your coach can see your progress." />
      {error && <QueryError error={error} retry={refetch} />}
      {isLoading && <Panel><LoadingRows /></Panel>}
      {data && (
        <div className="grid grid-main">
          <div className="stack">
            {data.workouts.length ? data.workouts.map((w) => <WorkoutCard key={w.id} w={w} />) : (
              <Panel><Empty icon={Dumbbell} title="No workouts assigned yet">Your coach will add workouts here. Ask the front desk if you’d like to be paired with a coach.</Empty></Panel>
            )}
          </div>
          <Panel title="Recent sessions" bodyClass={null}>
            {data.logs.length ? (
              <ul className="list">
                {data.logs.map((l) => (
                  <li key={l.id}>
                    <CheckCircle2 size={18} color="var(--ok)" aria-hidden />
                    <div className="grow">
                      <strong>{l.title}</strong>
                      <div className="subtle">{fmtDateTime(l.completed_at)}{l.effort ? ` · effort ${l.effort}/5` : ''}</div>
                      {l.notes && <div className="subtle">“{l.notes}”</div>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={CheckCircle2} title="Nothing logged yet">Finished a workout? Tap “Mark as done” on it.</Empty>}
          </Panel>
        </div>
      )}
    </main>
  );
}
