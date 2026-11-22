import { KeyRound, LogOut, Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Notice, PageHeader, Panel, SelectField, TextField } from '../components/ui';
import { api } from '../lib/api';
import { useSignOut } from '../components/confirm';
import { useAuth } from '../lib/auth';
import { useAction, useApi, useNet, useTitle } from '../lib/hooks';
import type { Member } from '../lib/types';

function MemberProfileForm() {
  const { data } = useApi<{ profile: Member }>('/member/overview');
  const p = data?.profile;
  const [form, setForm] = useState({ email: '', phone: '', birthdate: '', gender: '', emergency_contact: '', goal: '' });
  useEffect(() => {
    if (p) setForm({ email: p.email ?? '', phone: p.phone ?? '', birthdate: p.birthdate ?? '', gender: p.gender ?? '', emergency_contact: p.emergency_contact ?? '', goal: p.goal ?? '' });
  }, [p]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [save, saving] = useAction(() => api('/member/profile', { method: 'PATCH', body: form }), { success: 'Profile saved', invalidate: ['/member'] });

  return (
    <Panel title="Your details" description={p ? `Member code ${p.member_code}. Show this at the front desk.` : undefined}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="form-grid">
          <TextField label="Mobile number" type="tel" value={form.phone} onChange={set('phone')} />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} optional />
          <TextField label="Birthdate" type="date" value={form.birthdate} onChange={set('birthdate')} hint="Used to work out your age for coaching." />
          <SelectField label="Gender" value={form.gender} onChange={set('gender')} optional>
            <option value="">Prefer not to say</option>
            <option>Female</option><option>Male</option><option>Non-binary</option>
          </SelectField>
          <TextField label="Emergency contact" value={form.emergency_contact} onChange={set('emergency_contact')} placeholder="Name · phone" />
          <TextField label="Fitness goal" value={form.goal} onChange={set('goal')} placeholder="e.g. Build muscle" optional />
        </div>
        <div className="form-actions"><Button type="submit" variant="primary" icon={Save} loading={saving}>Save details</Button></div>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;
  const [save, saving] = useAction(() => api('/auth/password', { method: 'POST', body: { current, next } }), {
    success: 'Password changed',
    onSuccess: () => { setCurrent(''); setNext(''); setConfirm(''); },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!mismatch) void save();
  }
  return (
    <Panel title="Change password">
      <form className="stack" onSubmit={submit}>
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <div className="form-grid">
          <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint="At least 6 characters." />
          <TextField label="Repeat new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? 'Passwords don’t match' : null} />
        </div>
        <div className="form-actions">
          <Button type="submit" icon={KeyRound} loading={saving} disabled={!current || next.length < 6 || mismatch}>Change password</Button>
        </div>
      </form>
    </Panel>
  );
}

export default function Account() {
  const { user } = useAuth();
  const signOut = useSignOut();
  const net = useNet();
  useTitle('Account');
  if (!user) return null;
  return (
    <main className="content narrow">
      <PageHeader title="Account" description={`Signed in as ${user.full_name} (@${user.username})`} />
      {user.role === 'member' && <MemberProfileForm />}
      <PasswordForm />
      <Panel title="Sign out" description="Signing out also clears saved offline data from this device.">
        <div className="stack">
          {net.pending > 0 && (
            <Notice tone="warn" title={`${net.pending} entries haven’t synced yet`}>Reconnect to the gym Wi-Fi before signing out, or they’ll be lost.</Notice>
          )}
          <div><Button variant="danger" icon={LogOut} onClick={() => void signOut()}>Sign out</Button></div>
        </div>
      </Panel>
    </main>
  );
}
