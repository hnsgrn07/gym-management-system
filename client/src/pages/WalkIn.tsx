import { ArrowLeft, Check, LogIn, LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../components/Shell';
import { Button, Notice, Segmented, TextField } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDuration, fmtTime, minutesBetween, money } from '../lib/format';

type Mode = 'in' | 'out';
interface Done { mode: Mode; name: string; time_in: string; time_out?: string; paid?: boolean }

const SAVED = 'gym:walkin';
function saved(): { name: string; phone: string } {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? '') ?? { name: '', phone: '' };
  } catch {
    return { name: '', phone: '' };
  }
}

/** Public page a walk-in opens on their own phone. No account; identified by phone number. */
export function WalkIn() {
  const { settings } = useAuth();
  const [mode, setMode] = useState<Mode>('in');
  const [name, setName] = useState(saved().name);
  const [phone, setPhone] = useState(saved().phone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'in') {
        const r = await api<{ name: string; time_in: string; paid: boolean }>('/walkin/in', { method: 'POST', body: { full_name: name, phone } });
        try { localStorage.setItem(SAVED, JSON.stringify({ name, phone })); } catch { /* ignore */ }
        setDone({ mode, ...r });
      } else {
        const r = await api<{ name: string; time_in: string; time_out: string }>('/walkin/out', { method: 'POST', body: { phone } });
        setDone({ mode, ...r });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please see the front desk.');
    } finally {
      setBusy(false);
    }
  }

  if (!settings.walkin_self_service) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Notice tone="info" title="Please check in at the front desk">Self check-in for walk-ins is turned off at this gym.</Notice>
          <Link to="/login" className="btn"><ArrowLeft size={18} /> Back to sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark size={24} />
          <div>
            <h1 style={{ fontSize: '1.35rem' }}>{settings.gym_name}</h1>
            <p className="subtle">Walk-in day pass · {money(settings.walkin_fee)}</p>
          </div>
        </div>

        {done ? (
          <section className="panel auth-panel" style={{ alignItems: 'center', textAlign: 'center' }} aria-live="polite">
            <span className={`success-mark${done.mode === 'in' && !done.paid ? ' warn' : ''}`}><Check size={32} strokeWidth={2.5} /></span>
            <div className="stack-sm">
              <h2>{done.mode === 'in' ? `You’re in, ${done.name.split(' ')[0]}!` : `See you next time, ${done.name.split(' ')[0]}!`}</h2>
              {done.mode === 'in' ? (
                <p className="muted">Timed in at <strong>{fmtTime(done.time_in)}</strong>.</p>
              ) : (
                <p className="muted">
                  {fmtTime(done.time_in)} to {fmtTime(done.time_out)} · {fmtDuration(minutesBetween(done.time_in, done.time_out))}
                </p>
              )}
            </div>
            {done.mode === 'in' && !done.paid && (
              <Notice tone="warn" title={`Please pay ${money(settings.walkin_fee)} at the front desk`}>
                Come back to this page and tap “Time out” when you leave.
              </Notice>
            )}
            <Button block onClick={() => { setDone(null); setMode(done.mode === 'in' ? 'out' : 'in'); }}>
              {done.mode === 'in' ? 'Done' : 'Back'}
            </Button>
          </section>
        ) : (
          <form className="panel auth-panel" onSubmit={submit} noValidate>
            <Segmented<Mode> label="Choose action" block value={mode} onChange={(m) => { setMode(m); setError(null); }}
              options={[{ value: 'in', label: <><LogIn size={16} /> Time in</> }, { value: 'out', label: <><LogOut size={16} /> Time out</> }]} />
            {error && <Notice tone="bad">{error}</Notice>}
            {mode === 'in' && (
              <TextField label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            )}
            <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              hint={mode === 'in' ? 'Used only to time you out and recognise you next visit.' : 'The number you timed in with.'} required />
            <Button type="submit" variant="primary" size="lg" block loading={busy} icon={mode === 'in' ? LogIn : LogOut}
              disabled={!phone || (mode === 'in' && !name)}>
              {mode === 'in' ? 'Time in now' : 'Time out now'}
            </Button>
          </form>
        )}
        <Link to="/login" className="back-link" style={{ alignSelf: 'center' }}><ArrowLeft size={16} /> Member or staff sign in</Link>
      </div>
    </main>
  );
}
