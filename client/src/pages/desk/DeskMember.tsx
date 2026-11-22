import { CalendarDays, ClipboardList, KeyRound, LogIn, LogOut, Pencil, Power, Receipt, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { AttendanceTable } from '../../components/attendance';
import { useConfirm } from '../../components/confirm';
import {
  Avatar, Button, Dialog, Empty, LinkButton, LoadingRows, Notice, PageHeader, Panel, Pill, QueryError, SelectField, StatusPill, TextField,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { addDays, fmtDate, fmtDateTime, localDate, methodLabel, money } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Attendance, Member, Membership, Payment, Plan } from '../../lib/types';
import { MethodPicker, type Method } from './shared';

interface Detail { profile: Member; memberships: Membership[]; attendance: Attendance[]; payments: Payment[] }

function RenewPanel({ member }: { member: Member }) {
  const plans = useApi<Plan[]>('/plans');
  const [planId, setPlanId] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const plan = plans.data?.find((p) => String(p.id) === planId);
  const today = localDate();
  const start = member.paid_through && member.paid_through >= today ? addDays(member.paid_through, 1) : today;
  const end = plan ? addDays(start, plan.duration_days - 1) : null;
  const confirm = useConfirm();
  const [sell, selling] = useAction(() => api(`/desk/members/${member.id}/memberships`, { method: 'POST', body: { plan_id: Number(planId), method } }), {
    success: `Membership sold${plan ? ` · ${money(plan.price)} collected` : ''}`,
    invalidate: ['/desk', '/coach', '/admin'],
    onSuccess: () => setPlanId(''),
  });
  return (
    <Panel id="renew" title={member.status === 'none' ? 'Sell a membership' : 'Renew membership'}
      actions={<StatusPill status={member.status} daysLeft={member.days_left} size="lg" />}>
      <div className="stack">
        <p className="muted">
          {member.status === 'none' ? 'This member has never had a plan.'
            : member.paid_through && member.paid_through >= today ? <>Paid through <strong>{fmtDate(member.paid_through)}</strong>. A renewal starts the day after, so no days are lost.</>
            : <>Expired on <strong>{fmtDate(member.paid_through)}</strong>. A new plan starts today.</>}
        </p>
        <SelectField label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Choose a plan</option>
          {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}: {money(p.price)} · {p.duration_days} days</option>)}
        </SelectField>
        {plan && <>
          <MethodPicker value={method} onChange={setMethod} />
          <Notice tone="info">Covers <strong>{fmtDate(start)}</strong> to <strong>{fmtDate(end)}</strong>. Collect <strong>{money(plan.price)}</strong>.</Notice>
        </>}
        <div className="form-actions"><Button variant="primary" icon={RefreshCw} disabled={!plan} loading={selling} onClick={async () => {
          if (plan && await confirm({ title: `Collect ${money(plan.price)} for ${plan.name}?`, description: `${member.full_name} will be covered ${fmtDate(start)} to ${fmtDate(end)}. Make sure you’ve received the payment first.`, confirmLabel: `Yes, collected ${money(plan.price)}` })) void sell();
        }}>
          {plan ? `Collect ${money(plan.price)} & activate` : 'Sell plan'}
        </Button></div>
      </div>
    </Panel>
  );
}

function ProfilePanel({ member }: { member: Member }) {
  const coaches = useApi<{ id: number; full_name: string }[]>('/desk/coaches');
  const [editing, setEditing] = useState(false);
  const init = () => ({
    full_name: member.full_name, phone: member.phone ?? '', email: member.email ?? '', birthdate: member.birthdate ?? '', gender: member.gender ?? '',
    emergency_contact: member.emergency_contact ?? '', goal: member.goal ?? '', coach_id: member.coach_id ? String(member.coach_id) : '',
  });
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [member]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [save, saving] = useAction(() => api(`/desk/members/${member.id}`, { method: 'PATCH', body: { ...f, coach_id: f.coach_id ? Number(f.coach_id) : null } }), {
    success: 'Profile saved', invalidate: ['/desk', '/coach'], onSuccess: () => setEditing(false),
  });

  if (!editing) {
    return (
      <Panel title="Profile" actions={<Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}>
        <dl className="details">
          <dt>Member code</dt><dd>{member.member_code}</dd>
          <dt>Phone</dt><dd>{member.phone ?? '—'}</dd>
          <dt>Email</dt><dd>{member.email ?? '—'}</dd>
          <dt>Age</dt><dd>{member.age ?? '—'}{member.birthdate && <span className="subtle"> ({fmtDate(member.birthdate)})</span>}</dd>
          <dt>Gender</dt><dd>{member.gender ?? '—'}</dd>
          <dt>Emergency</dt><dd>{member.emergency_contact ?? '—'}</dd>
          <dt>Goal</dt><dd>{member.goal ?? '—'}</dd>
          <dt>Coach</dt><dd>{member.coach_name ?? 'None'}</dd>
          <dt>Sign-in</dt><dd>@{member.username}</dd>
          <dt>Joined</dt><dd>{fmtDate(member.created_at)}</dd>
        </dl>
      </Panel>
    );
  }
  return (
    <Panel title="Edit profile">
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Full name" value={f.full_name} onChange={set('full_name')} />
        <TextField label="Mobile number" type="tel" value={f.phone} onChange={set('phone')} />
        <TextField label="Email" type="email" value={f.email} onChange={set('email')} optional />
        <TextField label="Birthdate" type="date" value={f.birthdate} onChange={set('birthdate')} optional />
        <SelectField label="Gender" value={f.gender} onChange={set('gender')} optional>
          <option value="">Not specified</option><option>Female</option><option>Male</option><option>Non-binary</option>
        </SelectField>
        <TextField label="Emergency contact" value={f.emergency_contact} onChange={set('emergency_contact')} optional />
        <TextField label="Goal" value={f.goal} onChange={set('goal')} optional />
        <SelectField label="Coach" value={f.coach_id} onChange={set('coach_id')}>
          <option value="">No coach</option>
          {coaches.data?.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </SelectField>
        <div className="form-actions">
          <Button variant="ghost" onClick={() => { setF(init()); setEditing(false); }}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving}>Save</Button>
        </div>
      </form>
    </Panel>
  );
}

export default function DeskMember() {
  const { id } = useParams();
  const { user } = useAuth();
  const { hash } = useLocation();
  const { data, error, refetch } = useApi<Detail>(`/desk/members/${id}`);
  const summary = useApi<{ inside: { id: number; member_id: number | null }[] }>('/desk/summary');
  useTitle(data?.profile.full_name ?? 'Member');
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [deactivate, setDeactivate] = useState(false);

  useEffect(() => {
    if (hash && data) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, data]);

  const open = summary.data?.inside.find((r) => r.member_id === Number(id));
  const [toggle, toggling] = useAction(
    () => (open ? api('/desk/checkout', { method: 'POST', body: { attendance_id: open.id } }) : api('/desk/checkin', { method: 'POST', body: { member_id: Number(id) } })),
    { success: open ? 'Timed out' : 'Timed in', invalidate: ['/desk'] },
  );
  const [resetPw, resetting] = useAction(() => api(`/desk/members/${id}/reset-password`, { method: 'POST', body: { password: newPw } }), {
    success: 'Password reset. Give the member the new password.', onSuccess: () => setPwOpen(false),
  });
  const [setActive, settingActive] = useAction((active: boolean) => api(`/admin/users/${id}/active`, { method: 'PATCH', body: { active } }), {
    success: 'Account updated', invalidate: ['/desk'], onSuccess: () => setDeactivate(false),
  });

  if (error) return <main className="content"><QueryError error={error} retry={refetch} /></main>;
  if (!data) return <main className="content"><Panel><LoadingRows /></Panel></main>;
  const m = data.profile;
  const canTimeIn = m.status === 'active' || m.status === 'expiring';

  return (
    <main className="content">
      <PageHeader back={{ to: '/desk/members', label: 'Members' }}
        title={<span className="row"><Avatar name={m.full_name} size="lg" /> {m.full_name}</span>}
        description={`${m.member_code}${m.phone ? ` · ${m.phone}` : ''}`}
        actions={<>
          {user?.role === 'admin' && <LinkButton to={`/coach/members/${m.id}`} icon={ClipboardList}>Coaching view</LinkButton>}
          {m.active ? (open ? <Button icon={LogOut} loading={toggling} onClick={() => void toggle()}>Time out</Button>
            : <Button variant={canTimeIn ? 'primary' : 'secondary'} icon={LogIn} loading={toggling} disabled={!canTimeIn} title={canTimeIn ? undefined : 'Renew first, or use “Time in anyway” on the front desk'} onClick={() => void toggle()}>Time in</Button>) : null}
        </>} />
      <div className="row">
        <StatusPill status={m.status} daysLeft={m.days_left} />
        {open && <Pill tone="ok">In the gym now</Pill>}
        {!m.active && <Pill tone="bad">Account deactivated</Pill>}
      </div>

      <div className="grid grid-main">
        <div className="stack">
          {m.active ? <RenewPanel member={m} /> : <Notice tone="warn" title="This account is deactivated">They can’t sign in or time in. An admin can reactivate it below.</Notice>}
          <Panel title="Membership history" bodyClass={null}>
            {data.memberships.length ? (
              <ul className="list">
                {data.memberships.map((ms) => (
                  <li key={ms.id}>
                    <div className="grow">
                      <strong>{ms.plan_name}</strong>
                      <div className="subtle">{fmtDate(ms.start_date)} to {fmtDate(ms.end_date)}{ms.sold_by ? ` · sold by ${ms.sold_by}` : ''}</div>
                    </div>
                    <span className="tabular">{money(ms.price_paid)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={Receipt} title="No plans yet" />}
          </Panel>
          <Panel title="Recent visits" bodyClass={null}>
            {data.attendance.length ? <AttendanceTable rows={data.attendance} /> : <Empty icon={CalendarDays} title="No visits yet" />}
          </Panel>
        </div>
        <div className="stack">
          <ProfilePanel member={m} />
          <Panel title="Payments" bodyClass={null}>
            {data.payments.length ? (
              <ul className="list">
                {data.payments.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <div className="grow"><strong>{p.note ?? 'Payment'}</strong><div className="subtle">{fmtDateTime(p.created_at)} · {methodLabel(p.method)}{p.received_by_name ? ` · ${p.received_by_name}` : ''}</div></div>
                    <span className="tabular">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={Receipt} title="No payments yet" />}
          </Panel>
          <Panel title="Account">
            <div className="stack-sm">
              <Button icon={KeyRound} onClick={() => { setNewPw(''); setPwOpen(true); }}>Reset password</Button>
              {user?.role === 'admin' && (m.active
                ? <Button variant="danger" icon={Power} onClick={() => setDeactivate(true)}>Deactivate account</Button>
                : <Button icon={Power} loading={settingActive} onClick={() => void setActive(true)}>Reactivate account</Button>)}
            </div>
          </Panel>
        </div>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title={`Reset ${m.full_name.split(' ')[0]}’s password`}
        description="They’ll be signed out on all devices and must use the new password."
        footer={<>
          <Button onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={resetting} disabled={newPw.length < 6} onClick={() => void resetPw()}>Reset password</Button>
        </>}>
        <TextField label="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} hint="At least 6 characters." autoFocus />
      </Dialog>
      <Dialog open={deactivate} onClose={() => setDeactivate(false)} title={`Deactivate ${m.full_name}?`}
        description="They won’t be able to sign in or time in. Their history is kept, and you can reactivate them any time."
        footer={<>
          <Button onClick={() => setDeactivate(false)}>Cancel</Button>
          <Button variant="danger-solid" loading={settingActive} onClick={() => void setActive(false)}>Deactivate</Button>
        </>} />
    </main>
  );
}
