import { Archive, ArchiveRestore, CalendarDays, CheckCircle2, Copy, Dumbbell, Pencil, Plus, Save, Trash2, UserCheck, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AttendanceTable } from '../../components/attendance';
import { useConfirm } from '../../components/confirm';
import { StatsChart, StatsForm, StatsTable } from '../../components/stats';
import {
  Avatar, Button, Dialog, Empty, Facts, LinkButton, LoadingRows, PageHeader, Panel, Pill, QueryError, StatusPill, Tabs, TextareaField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { bmiCategory, fmtDate, fmtDateTime, relativeDay } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Attendance, Member, Stat, Workout, WorkoutLog } from '../../lib/types';
import { ExerciseTable } from '../member/MemberWorkouts';

interface Detail {
  profile: Member;
  stats: Stat[];
  workouts: Workout[];
  logs: WorkoutLog[];
  attendance: Attendance[];
  visits: { this_month: number; total_visits: number; week_streak: number };
}

function CoachNotes({ member }: { member: Member }) {
  const [notes, setNotes] = useState(member.coach_notes ?? '');
  useEffect(() => setNotes(member.coach_notes ?? ''), [member.coach_notes]);
  const dirty = notes !== (member.coach_notes ?? '');
  const [save, saving] = useAction(() => api(`/coach/members/${member.id}/notes`, { method: 'PATCH', body: { coach_notes: notes } }), {
    success: 'Notes saved', invalidate: [`/coach/members/${member.id}`],
  });
  return (
    <Panel title="Coach notes" description="Injuries, preferences, and goals. Visible to coaches only.">
      <div className="stack">
        <TextareaField label="Notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Old knee injury: avoid deep lunges" />
        <div className="form-actions"><Button icon={Save} loading={saving} disabled={!dirty} onClick={() => void save()}>Save notes</Button></div>
      </div>
    </Panel>
  );
}

function WorkoutList({ detail }: { detail: Detail }) {
  const id = detail.profile.id;
  const nav = useNavigate();
  const [confirm, setConfirm] = useState<Workout | null>(null);
  const ask = useConfirm();
  const [setStatus] = useAction((w: Workout) => api(`/coach/workouts/${w.id}/status`, { method: 'PATCH', body: { status: w.status === 'active' ? 'archived' : 'active' } }), {
    success: 'Workout updated', invalidate: [`/coach/members/${id}`],
  });
  const [remove, removing] = useAction((w: Workout) => api(`/coach/workouts/${w.id}`, { method: 'DELETE' }), {
    success: 'Workout deleted', invalidate: [`/coach/members/${id}`], onSuccess: () => setConfirm(null),
  });
  const active = detail.workouts.filter((w) => w.status === 'active');
  const archived = detail.workouts.filter((w) => w.status === 'archived');

  return (
    <div className="grid grid-main">
      <div className="stack">
        {active.length === 0 && (
          <Panel><Empty icon={Dumbbell} title="No active workouts" action={<LinkButton to={`/coach/members/${id}/workouts/new`} variant="primary" icon={Plus}>Create a workout</LinkButton>}>
            Build a custom workout. It appears on {detail.profile.full_name.split(' ')[0]}’s phone right away.
          </Empty></Panel>
        )}
        {[...active, ...archived].map((w) => (
          <Panel key={w.id} bodyClass={null}
            title={<>{w.day_label && <div className="day-tag">{w.day_label}{w.focus ? ` · ${w.focus}` : ''}</div>}{w.title} {w.status === 'archived' && <Pill plain>Archived</Pill>}</>}
            description={`${w.coach_name ? `By ${w.coach_name} · ` : ''}${w.times_done ? `Done ${w.times_done}× · last ${relativeDay(w.last_done)}` : 'Not done yet'}`}
            actions={<>
              <Button size="sm" icon={Pencil} onClick={() => nav(`/coach/workouts/${w.id}`)}>Edit</Button>
              <Button size="sm" variant="ghost" icon={Copy} aria-label="Duplicate" title="Duplicate" onClick={() => nav(`/coach/members/${id}/workouts/new?from=${w.id}`)} />
              <Button size="sm" variant="ghost" icon={w.status === 'active' ? Archive : ArchiveRestore} aria-label={w.status === 'active' ? 'Archive' : 'Restore'} title={w.status === 'active' ? 'Archive (hide from member)' : 'Restore'} onClick={async () => {
                if (w.status === 'active' && !(await ask({ title: `Archive “${w.title}”?`, description: 'It disappears from the member’s phone. You can restore it any time.', confirmLabel: 'Archive' }))) return;
                void setStatus(w);
              }} />
              <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" title="Delete" onClick={() => setConfirm(w)} />
            </>}>
            {w.status === 'active' && <>
              {w.notes && <div className="panel-body tight"><p className="muted">{w.notes}</p></div>}
              <ExerciseTable workout={w} />
            </>}
          </Panel>
        ))}
      </div>
      <Panel title="Completed sessions" bodyClass={null}>
        {detail.logs.length ? (
          <ul className="list">
            {detail.logs.map((l) => (
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
        ) : <Empty icon={CheckCircle2} title="No sessions logged">When the member marks a workout done, it shows up here with their effort and notes.</Empty>}
      </Panel>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={`Delete “${confirm?.title}”?`}
        description="The workout and its completion history are removed for good. Archive it instead to keep the history."
        footer={<>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger-solid" loading={removing} onClick={() => confirm && void remove(confirm)}>Delete workout</Button>
        </>} />
    </div>
  );
}

export default function CoachMember() {
  const { id } = useParams();
  const { user } = useAuth();
  const path = `/coach/members/${id}`;
  const { data, error, refetch } = useApi<Detail>(path);
  const [tab, setTab] = useState<'overview' | 'workouts' | 'stats' | 'visits'>('overview');
  useTitle(data?.profile.full_name ?? 'Member');
  const confirm = useConfirm();
  const [assign, assigning] = useAction((v: boolean) => api(`${path}/assign`, { method: 'POST', body: { assign: v } }), {
    success: (r: unknown) => ((r as Member).coach_id ? 'You’re now coaching this member' : 'Member released'),
    invalidate: ['/coach'],
  });

  if (error) return <main className="content"><QueryError error={error} retry={refetch} /></main>;
  if (!data) return <main className="content"><Panel><LoadingRows /></Panel></main>;
  const p = data.profile;
  const latest = data.stats.at(-1);
  const bmi = bmiCategory(latest?.bmi);
  const mine = p.coach_id === user?.id;

  return (
    <main className="content">
      <PageHeader
        back={{ to: '/coach', label: 'Members' }}
        title={<span className="row"><Avatar name={p.full_name} size="lg" /> {p.full_name}</span>}
        description={[p.member_code, p.age && `${p.age} yrs`, p.gender, p.goal && `Goal: ${p.goal}`].filter(Boolean).join(' · ')}
        actions={<>
          {mine ? <Button icon={UserMinus} loading={assigning} onClick={async () => {
              if (await confirm({ title: `Stop coaching ${p.full_name}?`, description: 'They’ll have no coach until someone takes them on. Their workouts and history stay as they are.', confirmLabel: 'Stop coaching', tone: 'danger' })) void assign(false);
            }}>Stop coaching</Button>
            : <Button icon={UserCheck} loading={assigning} onClick={async () => {
              if (p.coach_name && !(await confirm({ title: `Take over from ${p.coach_name}?`, description: `${p.full_name} will become your member and leave ${p.coach_name}’s list.`, confirmLabel: 'Take over', tone: 'primary' }))) return;
              void assign(true);
            }}>{p.coach_name ? `Take over from ${p.coach_name}` : 'Coach this member'}</Button>}
          <LinkButton to={`${path}/workouts/new`} variant="primary" icon={Plus}>New workout</LinkButton>
        </>}
      />
      <div className="row">
        <StatusPill status={p.status} daysLeft={p.days_left} />
        {p.inside && <Pill tone="ok">In the gym now</Pill>}
        {p.coach_name && <Pill tone="primary" plain>Coach: {mine ? 'You' : p.coach_name}</Pill>}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Overview' }, { value: 'workouts', label: `Workouts (${data.workouts.filter((w) => w.status === 'active').length})` },
        { value: 'stats', label: 'Body stats' }, { value: 'visits', label: 'Attendance' },
      ]} />

      {tab === 'overview' && (
        <div className="grid grid-main">
          <div className="stack">
            <Facts items={[
              { label: 'Weight', value: latest?.weight_kg ? `${latest.weight_kg} kg` : '—', note: latest ? `Logged ${fmtDate(latest.recorded_on)}` : 'No entries' },
              { label: 'BMI', value: latest?.bmi ?? '—', note: bmi.label || undefined },
              { label: 'Body fat', value: latest?.body_fat_pct ? `${latest.body_fat_pct}%` : '—' },
              { label: 'Visits this month', value: data.visits.this_month, note: `${data.visits.week_streak}-week streak` },
            ]} />
            <Panel title="Progress"><StatsChart stats={data.stats} /></Panel>
          </div>
          <div className="stack">
            <CoachNotes member={p} />
            <Panel title="Profile">
              <dl className="details">
                <dt>Phone</dt><dd>{p.phone ?? '—'}</dd>
                <dt>Emergency</dt><dd>{p.emergency_contact ?? '—'}</dd>
                <dt>Last visit</dt><dd>{relativeDay(p.last_visit)}</dd>
                <dt>Member since</dt><dd>{fmtDate(p.created_at)}</dd>
              </dl>
            </Panel>
          </div>
        </div>
      )}
      {tab === 'workouts' && <WorkoutList detail={data} />}
      {tab === 'stats' && (
        <div className="grid grid-main">
          <Panel title="All entries" bodyClass={null}>
            {data.stats.length ? <StatsTable stats={data.stats} /> : <Empty icon={CalendarDays} title="No measurements yet">Log the member’s first measurements here.</Empty>}
          </Panel>
          <Panel title="Log measurements" description={`Recorded for ${p.full_name}`}>
            <StatsForm endpoint={`${path}/stats`} lastHeight={[...data.stats].reverse().find((s) => s.height_cm)?.height_cm} invalidate={[path]} />
          </Panel>
        </div>
      )}
      {tab === 'visits' && (
        <Panel bodyClass={null} title="Recent visits">
          {data.attendance.length ? <AttendanceTable rows={data.attendance} /> : <Empty icon={CalendarDays} title="No visits yet" />}
        </Panel>
      )}
    </main>
  );
}
