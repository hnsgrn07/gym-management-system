import { Pencil, Plus, Save, Tags } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Empty, LoadingRows, Notice, PageHeader, Panel, Pill, QueryError, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Plan } from '../../lib/types';

const blank = { name: '', duration_days: '30', price: '', description: '', active: true };

export default function AdminPlans() {
  useTitle('Plans & pricing');
  const { settings } = useAuth();
  const { data, error, refetch } = useApi<Plan[]>('/admin/plans');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);

  const start = (p?: Plan) => {
    setErr(null);
    setEditing(p ? p.id : 'new');
    setF(p ? { name: p.name, duration_days: String(p.duration_days), price: String(p.price), description: p.description ?? '', active: !!p.active } : blank);
  };
  const [save, saving] = useAction(
    () => {
      const body = { ...f, duration_days: Number(f.duration_days), price: Number(f.price) };
      return editing === 'new' ? api('/admin/plans', { method: 'POST', body }) : api(`/admin/plans/${editing}`, { method: 'PUT', body });
    },
    { success: 'Plan saved', invalidate: ['/admin/plans', '/plans'], onSuccess: () => setEditing(null), onError: (e) => { setErr(e.message); return true; } },
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }
  const perDay = Number(f.price) && Number(f.duration_days) ? Number(f.price) / Number(f.duration_days) : null;

  return (
    <main className="content">
      <PageHeader title="Plans & pricing" description={`Membership plans the front desk can sell. Walk-in day pass is ${money(settings.walkin_fee)} (change it in Gym settings).`}
        actions={<Button variant="primary" icon={Plus} onClick={() => start()}>New plan</Button>} />
      {error && <QueryError error={error} retry={refetch} />}
      <div className="grid grid-main">
        <Panel bodyClass={null}>
          {!data ? <LoadingRows /> : data.length ? (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Plan</th><th>Length</th><th>Price</th><th>Sold</th><th>Status</th><th className="right"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id}>
                      <td data-primary><strong>{p.name}</strong>{p.description && <div className="subtle">{p.description}</div>}</td>
                      <td data-label="Length">{p.duration_days} days</td>
                      <td data-label="Price" className="tabular">{money(p.price)}</td>
                      <td data-label="Sold">{p.times_sold}</td>
                      <td data-label="Status">{p.active ? <Pill tone="ok" plain>On sale</Pill> : <Pill plain>Hidden</Pill>}</td>
                      <td className="right actions-cell"><Button size="sm" icon={Pencil} onClick={() => start(p)}>Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={Tags} title="No plans yet" action={<Button variant="primary" icon={Plus} onClick={() => start()}>Create a plan</Button>}>Create plans like Monthly or Annual so the desk can sell memberships.</Empty>}
        </Panel>
        {editing !== null ? (
          <Panel title={editing === 'new' ? 'New plan' : 'Edit plan'}>
            <form className="stack" onSubmit={submit}>
              <TextField label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Monthly" autoFocus />
              <div className="form-grid">
                <TextField label="Length" unit="days" type="number" min="1" value={f.duration_days} onChange={(e) => setF({ ...f, duration_days: e.target.value })} />
                <TextField label="Price" unit={settings.currency} type="number" min="0" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
              </div>
              {perDay && <p className="subtle">Works out to {money(perDay)} per day.</p>}
              <TextField label="Description" optional value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              <Checkbox label="On sale" hint="Hidden plans stay on existing memberships but can’t be sold." checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
              {editing !== 'new' && <Notice tone="info">Price changes apply to new sales only.</Notice>}
              {err && <Notice tone="bad">{err}</Notice>}
              <div className="form-actions">
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" variant="primary" icon={Save} loading={saving}>Save plan</Button>
              </div>
            </form>
          </Panel>
        ) : (
          <Panel title="Tips"><p className="muted">Keep 3–4 plans so the choice at the desk is quick. Hide a plan instead of deleting it so past sales stay accurate.</p></Panel>
        )}
      </div>
    </main>
  );
}
