import { ArrowDown, ArrowUp, Plus, Save, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, LoadingRows, Notice, PageHeader, Panel, SelectField, TextareaField, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { WEEKDAYS } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Exercise, Member, Workout } from '../../lib/types';

const COMMON = [
  'Back squat', 'Front squat', 'Goblet squat', 'Deadlift', 'Romanian deadlift', 'Bench press', 'Incline dumbbell press', 'Overhead press',
  'Pull-up', 'Lat pulldown', 'Bent-over row', 'Seated cable row', 'Dumbbell row', 'Hip thrust', 'Walking lunge', 'Bulgarian split squat',
  'Leg press', 'Leg curl', 'Leg extension', 'Calf raise', 'Bicep curl', 'Tricep pushdown', 'Lateral raise', 'Face pull', 'Push-up', 'Dips',
  'Plank', 'Hanging knee raise', 'Russian twist', 'Kettlebell swing', 'Treadmill', 'Rower', 'Bike', 'Jump rope', 'Burpees',
];

type Row = { name: string; sets: string; reps: string; load: string; rest_sec: string; notes: string };
const blank = (): Row => ({ name: '', sets: '3', reps: '10', load: '', rest_sec: '60', notes: '' });
const toRow = (e: Exercise): Row => ({
  name: e.name, sets: e.sets?.toString() ?? '', reps: e.reps ?? '', load: e.load ?? '', rest_sec: e.rest_sec?.toString() ?? '', notes: e.notes ?? '',
});

export default function WorkoutEditor() {
  const { id: memberParam, workoutId } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const editing = !!workoutId;
  const nav = useNavigate();

  const source = useApi<{ workout: Workout; member: Member }>(workoutId || fromId ? `/coach/workouts/${workoutId ?? fromId}` : null);
  const memberQ = useApi<{ profile: Member }>(memberParam ? `/coach/members/${memberParam}` : null);
  const member = source.data?.member && editing ? source.data.member : memberQ.data?.profile;
  useTitle(editing ? 'Edit workout' : 'New workout');

  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [focus, setFocus] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = source.data?.workout;
    if (!w) return;
    setTitle(editing ? w.title : `${w.title} (copy)`);
    setDay(w.day_label ?? '');
    setFocus(w.focus ?? '');
    setNotes(w.notes ?? '');
    setRows(w.exercises.length ? w.exercises.map(toRow) : [blank()]);
  }, [source.data, editing]);

  const update = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const next = [...rs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  });

  const memberId = member?.id;
  const [save, saving] = useAction(
    () => {
      const body = {
        title, day_label: day || null, focus: focus || null, notes: notes || null,
        exercises: rows.filter((r) => r.name.trim()).map((r) => ({
          name: r.name.trim(), sets: r.sets ? Number(r.sets) : null, reps: r.reps || null, load: r.load || null,
          rest_sec: r.rest_sec ? Number(r.rest_sec) : null, notes: r.notes || null,
        })),
      };
      return editing ? api(`/coach/workouts/${workoutId}`, { method: 'PUT', body }) : api(`/coach/members/${memberId}/workouts`, { method: 'POST', body });
    },
    {
      success: editing ? 'Workout updated' : 'Workout created and sent to the member',
      invalidate: ['/coach'],
      onSuccess: () => nav(`/coach/members/${memberId}`, { replace: true }),
      onError: (e) => { setError(e.message); return true; },
    },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Give the workout a title.');
    if (!rows.some((r) => r.name.trim())) return setError('Add at least one exercise.');
    void save();
  }

  if (source.isLoading || (!member && !source.error && !memberQ.error)) return <main className="content"><Panel><LoadingRows /></Panel></main>;

  return (
    <main className="content">
      <PageHeader
        back={member ? { to: `/coach/members/${member.id}`, label: member.full_name } : undefined}
        title={editing ? 'Edit workout' : 'New workout'}
        description={member ? `For ${member.full_name}${member.goal ? ` · Goal: ${member.goal}` : ''}` : undefined}
      />
      {member?.coach_notes && <Notice tone="info" title="Your notes on this member">{member.coach_notes}</Notice>}
      <form className="stack" onSubmit={submit} noValidate>
        <Panel title="Details">
          <div className="stack">
            <div className="form-grid">
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Upper body strength" required />
              <SelectField label="Day" value={day} onChange={(e) => setDay(e.target.value)} hint="The member sees today’s workout first.">
                <option value="">Any day</option>
                {WEEKDAYS.slice(1).concat(WEEKDAYS[0]).map((d) => <option key={d}>{d}</option>)}
                {['Day 1', 'Day 2', 'Day 3', 'Day 4'].map((d) => <option key={d}>{d}</option>)}
              </SelectField>
              <TextField label="Focus" optional value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Legs, Push, Cardio" />
            </div>
            <TextareaField label="Instructions" optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Warm-up, tempo, cues…" />
          </div>
        </Panel>

        <Panel title="Exercises" description={`${rows.filter((r) => r.name.trim()).length} exercises`}>
          <datalist id="exercise-names">{COMMON.map((n) => <option key={n} value={n} />)}</datalist>
          <div className="stack-sm">
            <div className="ex-row ex-row-head" aria-hidden>
              <span /><span>Exercise</span><span>Sets</span><span>Reps</span><span>Load</span><span>Rest (s)</span><span />
            </div>
            {rows.map((r, i) => (
              <div className="ex-row" key={i} role="group" aria-label={`Exercise ${i + 1}`}>
                <span className="idx">{i + 1}</span>
                <input className="input ex-name" list="exercise-names" placeholder="Exercise name" aria-label="Exercise name" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} />
                <input className="input" inputMode="numeric" aria-label="Sets" placeholder="Sets" value={r.sets} onChange={(e) => update(i, 'sets', e.target.value.replace(/\D/g, ''))} />
                <input className="input" aria-label="Reps" placeholder="Reps, e.g. 8–10" value={r.reps} onChange={(e) => update(i, 'reps', e.target.value)} />
                <input className="input" aria-label="Load" placeholder="Load, e.g. 40 kg" value={r.load} onChange={(e) => update(i, 'load', e.target.value)} />
                <input className="input" inputMode="numeric" aria-label="Rest in seconds" placeholder="Rest" value={r.rest_sec} onChange={(e) => update(i, 'rest_sec', e.target.value.replace(/\D/g, ''))} />
                <div className="ex-tools">
                  <Button size="sm" variant="ghost" icon={ArrowUp} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                  <Button size="sm" variant="ghost" icon={ArrowDown} aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                  <Button size="sm" variant="ghost" icon={X} aria-label="Remove exercise" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} />
                </div>
                <input className="input ex-notes" aria-label="Exercise notes" placeholder="Notes (optional), e.g. pause at the bottom" value={r.notes} onChange={(e) => update(i, 'notes', e.target.value)} />
              </div>
            ))}
            <div><Button icon={Plus} onClick={() => setRows((rs) => [...rs, blank()])}>Add exercise</Button></div>
          </div>
        </Panel>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          <Button type="submit" variant="primary" size="lg" icon={Save} loading={saving}>{editing ? 'Save changes' : 'Create workout'}</Button>
        </div>
      </form>
    </main>
  );
}
