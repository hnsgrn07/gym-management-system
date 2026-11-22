import { Pencil, Power, Save, UserCog, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useConfirm } from '../../components/confirm';
import { Avatar, Button, Empty, LoadingRows, Notice, PageHeader, Panel, Pill, QueryError, SelectField, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { relativeDay } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';

interface Staff { id: number; role: 'admin' | 'clerk' | 'coach'; username: string; full_name: string; email: string | null; phone: string | null; active: number; last_login: string | null }
const ROLES = { admin: 'Admin', clerk: 'Front desk', coach: 'Coach' } as const;
const ROLE_HINT = {
  admin: 'Everything: reports, plans, staff, settings, plus desk and coaching.',
  clerk: 'Front desk: time in/out, walk-ins, members, and payments.',
  coach: 'Members’ stats and attendance, and building workouts.',
};
const blank = { role: 'clerk' as Staff['role'], username: '', full_name: '', email: '', phone: '', password: '' };

export default function AdminStaff() {
  useTitle('Staff accounts');
  const { user } = useAuth();
  const { data, error, refetch } = useApi<Staff[]>('/admin/staff');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const start = (s?: Staff) => {
    setErr(null);
    setEditing(s ? s.id : 'new');
    setF(s ? { role: s.role, username: s.username, full_name: s.full_name, email: s.email ?? '', phone: s.phone ?? '', password: '' } : blank);
  };
  const [save, saving] = useAction(
    () => (editing === 'new' ? api('/admin/staff', { method: 'POST', body: f }) : api(`/admin/staff/${editing}`, { method: 'PUT', body: f })),
    { success: 'Staff account saved', invalidate: ['/admin/staff', '/desk/coaches'], onSuccess: () => setEditing(null), onError: (e) => { setErr(e.message); return true; } },
  );
  const [toggle] = useAction((s: Staff) => api(`/admin/users/${s.id}/active`, { method: 'PATCH', body: { active: !s.active } }), {
    success: 'Account updated', invalidate: ['/admin/staff'],
  });
  const confirm = useConfirm();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (editing === 'new') {
      if (await confirm({ title: `Create a ${ROLES[f.role].toLowerCase()} account for ${f.full_name || 'this person'}?`, description: ROLE_HINT[f.role], confirmLabel: 'Create account' })) void save();
      return;
    }
    const orig = data?.find((s) => s.id === editing);
    if (!orig) return;
    const changes: string[] = [];
    if (orig.role !== f.role) changes.push(`Role: ${ROLES[orig.role]} → ${ROLES[f.role]}`);
    if (orig.username !== f.username) changes.push(`Username: @${orig.username} → @${f.username}`);
    if (orig.full_name !== f.full_name) changes.push(`Name: ${orig.full_name} → ${f.full_name}`);
    if ((orig.phone ?? '') !== f.phone || (orig.email ?? '') !== f.email) changes.push('Contact details updated');
    if (f.password) changes.push('Password reset (they’ll be signed out everywhere)');
    if (!changes.length) { setEditing(null); return; }
    if (await confirm({
      title: `Save changes to ${orig.full_name}?`,
      description: <ul style={{ margin: 0, paddingLeft: 18 }}>{changes.map((c) => <li key={c}>{c}</li>)}</ul>,
      confirmLabel: 'Save changes',
    })) void save();
  };

  return (
    <main className="content">
      <PageHeader title="Staff accounts" description="Who can sign in to run the gym. Members are managed from Members."
        actions={<Button variant="primary" icon={UserPlus} onClick={() => start()}>Add staff</Button>} />
      {error && <QueryError error={error} retry={refetch} />}
      <div className="grid grid-main">
        <Panel bodyClass={null}>
          {!data ? <LoadingRows /> : data.length ? (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th>Status</th><th className="right"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.map((s) => (
                    <tr key={s.id}>
                      <td data-primary><div className="cell-person"><Avatar name={s.full_name} /><div><div className="name">{s.full_name}{s.id === user?.id ? ' (you)' : ''}</div><div className="meta">@{s.username}</div></div></div></td>
                      <td data-label="Role"><Pill tone={s.role === 'admin' ? 'primary' : ''} plain>{ROLES[s.role]}</Pill></td>
                      <td data-label="Last sign-in">{s.last_login ? relativeDay(s.last_login) : 'Never'}</td>
                      <td data-label="Status">{s.active ? <Pill tone="ok" plain>Active</Pill> : <Pill tone="bad" plain>Deactivated</Pill>}</td>
                      <td className="right actions-cell">
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', width: '100%' }}>
                          <Button size="sm" icon={Pencil} onClick={() => start(s)}>Edit</Button>
                          {s.id !== user?.id && <Button size="sm" variant={s.active ? 'danger' : 'secondary'} icon={Power} onClick={async () => {
                            if (s.active && !(await confirm({ title: `Deactivate ${s.full_name}?`, description: 'They’re signed out everywhere and can’t sign in until reactivated. Their past records are kept.', confirmLabel: 'Deactivate', tone: 'danger' }))) return;
                            void toggle(s);
                          }}>{s.active ? 'Deactivate' : 'Reactivate'}</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={UserCog} title="No staff yet" />}
        </Panel>
        {editing !== null && (
          <Panel title={editing === 'new' ? 'Add staff' : 'Edit staff'}>
            <form className="stack" onSubmit={submit}>
              <SelectField label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Staff['role'] })} hint={ROLE_HINT[f.role]}>
                {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectField>
              <TextField label="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus />
              <TextField label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" />
              <TextField label="Phone" optional value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              <TextField label="Email" optional type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              <TextField label={editing === 'new' ? 'Password' : 'New password'} optional={editing !== 'new'} type="text" value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })} hint={editing === 'new' ? 'At least 6 characters. They can change it later.' : 'Leave blank to keep the current password.'} />
              {err && <Notice tone="bad">{err}</Notice>}
              <div className="form-actions">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" variant="primary" icon={Save} loading={saving}>Save</Button>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </main>
  );
}
