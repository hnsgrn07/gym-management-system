import { Check, LogIn, Printer, RefreshCw, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Notice, PageHeader, Panel, SelectField, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, money, relativeDay } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Plan } from '../../lib/types';
import { MethodPicker, type Method } from './shared';

const tempPassword = () => {
  const words = ['lift', 'squat', 'press', 'row', 'sprint', 'plank', 'curl', 'jump'];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(1000 + Math.random() * 9000)}`;
};

interface WalkinInfo { id: number; full_name: string; phone: string | null; converted_member_id: number | null; visits: number; first_visit: string | null; inside: number; total_paid: number }
interface Created { id: number; member_code: string; username: string; visits_moved: number; membership: { plan_name: string; start_date: string; end_date: string; amount: number } | null }

export default function NewMember() {
  useTitle('New member');
  const nav = useNavigate();
  const [params] = useSearchParams();
  const walkinId = params.get('walkin');
  const walkin = useApi<WalkinInfo>(walkinId ? `/desk/walkins/${walkinId}` : null);
  const plans = useApi<Plan[]>('/plans');
  const coaches = useApi<{ id: number; full_name: string }[]>('/desk/coaches');
  const [f, setF] = useState({
    full_name: params.get('name') ?? '', phone: '', email: '', birthdate: '', gender: '', emergency_contact: '', goal: '', username: '', coach_id: '',
  });
  const [password, setPassword] = useState(tempPassword);
  const [planId, setPlanId] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  useEffect(() => {
    if (walkin.data) setF((x) => ({ ...x, full_name: walkin.data.full_name, phone: walkin.data.phone ?? '' }));
  }, [walkin.data]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const plan = plans.data?.find((p) => String(p.id) === planId);

  const [create, creating] = useAction(
    () => api<Created>('/desk/members', {
      method: 'POST',
      body: { ...f, coach_id: f.coach_id ? Number(f.coach_id) : null, password, plan_id: planId ? Number(planId) : null, method, walkin_id: walkinId ? Number(walkinId) : null },
    }),
    { invalidate: ['/desk', '/coach', '/admin'], onSuccess: (r) => setCreated(r), onError: (e) => { setError(e.message); return true; } },
  );
  const [checkIn, checkingIn] = useAction((id: number) => api('/desk/checkin', { method: 'POST', body: { member_id: id } }), {
    success: 'Timed in', invalidate: ['/desk'], onSuccess: () => nav('/desk'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.full_name.trim().length < 2) return setError('Enter the member’s full name.');
    void create();
  }

  if (created) {
    return (
      <main className="content narrow">
        <PageHeader title="Member registered" />
        <Panel>
          <div className="stack">
            <div className="row"><span className="success-mark"><Check size={30} /></span>
              <div><h2>{f.full_name}</h2><p className="muted">Member code <strong>{created.member_code}</strong></p></div>
            </div>
            {created.visits_moved > 0 && (
              <Notice tone="ok" title={`${created.visits_moved} walk-in ${created.visits_moved === 1 ? 'visit' : 'visits'} moved to their member record`}>
                Their time in and time out history continues without a gap.
              </Notice>
            )}
            {created.membership ? (
              <Notice tone="ok" title={`${created.membership.plan_name} · ${money(created.membership.amount)} paid`}>
                Active {fmtDate(created.membership.start_date)} to {fmtDate(created.membership.end_date)}.
              </Notice>
            ) : <Notice tone="warn" title="No plan sold yet">They can’t time in until they have an active membership.</Notice>}
            <div className="stack-sm">
              <h3>Sign-in details to give the member</h3>
              <p className="muted">They can sign in on their phone to time in and out, log stats, and see workouts. Ask them to change the password after signing in.</p>
              <div className="credential"><span className="muted">Username</span><code>{created.username}</code></div>
              <div className="credential"><span className="muted">Temporary password</span><code>{password}</code></div>
            </div>
            <div className="form-actions">
              <Button icon={Printer} onClick={() => window.print()}>Print</Button>
              <Button onClick={() => nav(`/desk/members/${created.id}`)}>Open profile</Button>
              {created.membership && <Button variant="primary" icon={LogIn} loading={checkingIn} onClick={() => void checkIn(created.id)}>Time in now</Button>}
            </div>
          </div>
        </Panel>
      </main>
    );
  }

  return (
    <main className="content narrow">
      <PageHeader back={walkinId ? { to: '/desk', label: 'Front desk' } : { to: '/desk/members', label: 'Members' }}
        title={walkinId ? 'Make walk-in a member' : 'New member'}
        description={walkinId ? 'Their walk-in visits and payments move to the new member record.' : 'Only the name is required. Everything else can be added later.'} />
      {walkin.data && (walkin.data.converted_member_id ? (
        <Notice tone="warn" title={`${walkin.data.full_name} is already a member`} action={<div><Button size="sm" onClick={() => nav(`/desk/members/${walkin.data!.converted_member_id}`)}>Open their profile</Button></div>} />
      ) : (
        <Notice tone="info" title={`Converting walk-in ${walkin.data.full_name}`}>
          Their {walkin.data.visits} walk-in {walkin.data.visits === 1 ? 'visit' : 'visits'} (first: {relativeDay(walkin.data.first_visit).toLowerCase()}){walkin.data.total_paid > 0 ? ` and ${money(walkin.data.total_paid)} in day passes` : ''} will carry over.
          {walkin.data.inside > 0 && ' They’re in the gym now and stay timed in as a member.'}
        </Notice>
      ))}
      <form className="stack" onSubmit={submit} noValidate>
        <Panel title="Personal details">
          <div className="form-grid">
            <TextField label="Full name" value={f.full_name} onChange={set('full_name')} autoFocus required autoComplete="off" />
            <TextField label="Mobile number" type="tel" value={f.phone} onChange={set('phone')} optional />
            <TextField label="Email" type="email" value={f.email} onChange={set('email')} optional />
            <TextField label="Birthdate" type="date" value={f.birthdate} onChange={set('birthdate')} optional />
            <SelectField label="Gender" value={f.gender} onChange={set('gender')} optional>
              <option value="">Not specified</option><option>Female</option><option>Male</option><option>Non-binary</option>
            </SelectField>
            <TextField label="Emergency contact" value={f.emergency_contact} onChange={set('emergency_contact')} placeholder="Name · phone" optional />
            <TextField label="Fitness goal" value={f.goal} onChange={set('goal')} placeholder="e.g. Lose fat" optional />
            <SelectField label="Coach" value={f.coach_id} onChange={set('coach_id')} optional>
              <option value="">No coach</option>
              {coaches.data?.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </SelectField>
          </div>
        </Panel>

        <Panel title="Membership" description="Sell a plan now, or leave it for later.">
          <div className="stack">
            <SelectField label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">No plan yet</option>
              {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}: {money(p.price)} for {p.duration_days} days</option>)}
            </SelectField>
            {plan && <>
              <MethodPicker value={method} onChange={setMethod} />
              <Notice tone="info">Collect <strong>{money(plan.price)}</strong>. Active today for {plan.duration_days} days.</Notice>
            </>}
          </div>
        </Panel>

        <Panel title="App sign-in" description="Members sign in with their member code or this username.">
          <div className="form-grid">
            <TextField label="Username" optional value={f.username} onChange={set('username')} placeholder="Defaults to member code" autoCapitalize="none" />
            <div className="field">
              <label className="field-label" htmlFor="tmp-pw">Temporary password</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="tmp-pw" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button icon={RefreshCw} aria-label="Generate a new password" onClick={() => setPassword(tempPassword())} />
              </div>
              <span className="field-hint">Shown again after saving so you can give it to the member.</span>
            </div>
          </div>
        </Panel>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          <Button type="submit" variant="primary" size="lg" icon={UserPlus} loading={creating}>
            {plan ? `${walkinId ? 'Convert' : 'Register'} & collect ${money(plan.price)}` : walkinId ? 'Make member' : 'Register member'}
          </Button>
        </div>
      </form>
    </main>
  );
}
