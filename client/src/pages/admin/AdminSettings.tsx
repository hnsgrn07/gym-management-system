import { Save } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Checkbox, LoadingRows, PageHeader, Panel, QueryError, SelectField, TextField } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAction, useApi, useTitle } from '../../lib/hooks';

interface Settings {
  gym_name: string; currency: string; walkin_fee: number; expiring_days: number; walkin_self_service: boolean; open_hours: string; demo_mode: boolean;
}
const CURRENCIES = [
  ['PHP', 'Philippine peso (₱)'], ['USD', 'US dollar ($)'], ['EUR', 'Euro (€)'], ['GBP', 'British pound (£)'], ['INR', 'Indian rupee (₹)'],
  ['IDR', 'Indonesian rupiah (Rp)'], ['MYR', 'Malaysian ringgit (RM)'], ['SGD', 'Singapore dollar (S$)'], ['THB', 'Thai baht (฿)'], ['VND', 'Vietnamese dong (₫)'],
  ['AUD', 'Australian dollar (A$)'], ['CAD', 'Canadian dollar (C$)'], ['NGN', 'Nigerian naira (₦)'], ['ZAR', 'South African rand (R)'],
];

export default function AdminSettings() {
  useTitle('Gym settings');
  const { refresh } = useAuth();
  const { data, error, refetch } = useApi<Settings>('/admin/settings');
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const [save, saving] = useAction(() => api('/admin/settings', { method: 'PUT', body: { ...f, walkin_fee: Number(f!.walkin_fee), expiring_days: Number(f!.expiring_days) } }), {
    success: 'Settings saved', invalidate: ['/admin/settings'], onSuccess: () => void refresh(),
  });
  if (error) return <main className="content narrow"><QueryError error={error} retry={refetch} /></main>;
  if (!f) return <main className="content narrow"><Panel><LoadingRows /></Panel></main>;
  const submit = (e: FormEvent) => { e.preventDefault(); void save(); };
  const known = CURRENCIES.some(([c]) => c === f.currency);

  return (
    <main className="content narrow">
      <PageHeader title="Gym settings" />
      <form className="stack" onSubmit={submit}>
        <Panel title="Your gym">
          <div className="stack">
            <TextField label="Gym name" value={f.gym_name} onChange={(e) => setF({ ...f, gym_name: e.target.value })} hint="Shown on the sign-in page and in the app header." />
            <TextField label="Opening hours" optional value={f.open_hours} onChange={(e) => setF({ ...f, open_hours: e.target.value })} placeholder="e.g. Mon–Sat 6:00–22:00" />
          </div>
        </Panel>
        <Panel title="Money">
          <div className="form-grid">
            <SelectField label="Currency" value={known ? f.currency : '__other'} onChange={(e) => setF({ ...f, currency: e.target.value === '__other' ? '' : e.target.value })}>
              {CURRENCIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              <option value="__other">Other…</option>
            </SelectField>
            {!known && <TextField label="Currency code" value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} hint="3-letter ISO code, e.g. KES" />}
            <TextField label="Walk-in day pass" unit={f.currency} type="number" min="0" step="0.01" value={String(f.walkin_fee)} onChange={(e) => setF({ ...f, walkin_fee: e.target.value as unknown as number })} />
          </div>
        </Panel>
        <Panel title="Front desk">
          <div className="stack">
            <TextField label="“Expiring soon” warning" unit="days" type="number" min="1" max="60" value={String(f.expiring_days)}
              onChange={(e) => setF({ ...f, expiring_days: e.target.value as unknown as number })} hint="Memberships ending within this many days are flagged for renewal." />
            <Checkbox label="Let walk-ins time themselves in and out on their phone" checked={f.walkin_self_service}
              onChange={(e) => setF({ ...f, walkin_self_service: e.target.checked })} hint="Adds a “Walk-in? Time in here” link on the sign-in page. Fees are still collected at the desk." />
            <Checkbox label="Show demo accounts on the sign-in page" checked={f.demo_mode}
              onChange={(e) => setF({ ...f, demo_mode: e.target.checked })} hint="Turn this off before using the system for real." />
          </div>
        </Panel>
        <div className="form-actions"><Button type="submit" variant="primary" size="lg" icon={Save} loading={saving}>Save settings</Button></div>
      </form>
    </main>
  );
}
