import { Eye, EyeOff, LogIn, UserRoundPlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../components/Shell';
import { Button, Notice, TextField } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';

const DEMO = [
  { role: 'Admin', username: 'admin', password: 'admin123' },
  { role: 'Front desk', username: 'clerk', password: 'clerk123' },
  { role: 'Coach', username: 'coach', password: 'coach123' },
  { role: 'Member', username: 'member', password: 'member123' },
];

export function Login() {
  const { login, settings } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t sign in. Try again.');
      pwRef.current?.select();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark size={24} />
          <div>
            <h1 style={{ fontSize: '1.35rem' }}>{settings.gym_name}</h1>
            {settings.open_hours && <p className="subtle">{settings.open_hours}</p>}
          </div>
        </div>

        <form className="panel auth-panel" onSubmit={submit} noValidate>
          <div className="stack-sm">
            <h2>Sign in</h2>
            <p className="muted">Members, coaches, and staff use the same sign-in.</p>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <TextField
            label="Username or member code"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. M-0001"
            autoFocus
            required
          />
          <div className="field">
            <label className="field-label" htmlFor="pw">Password</label>
            <div className="input-unit">
              <input ref={pwRef} id="pw" className="input" type={show ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <span style={{ pointerEvents: 'auto', right: 4 }}>
                <Button variant="ghost" size="sm" icon={show ? EyeOff : Eye} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} />
              </span>
            </div>
          </div>
          <Button type="submit" variant="primary" size="lg" block icon={LogIn} loading={busy} disabled={!username || !password}>
            Sign in
          </Button>
          <p className="subtle" style={{ textAlign: 'center' }}>Forgot your password? Ask the front desk to reset it.</p>
        </form>

        {settings.walkin_self_service && (
          <Link to="/walk-in" className="panel row" style={{ padding: 'var(--s4) var(--s5)', textDecoration: 'none', color: 'inherit' }}>
            <span className="avatar walkin"><UserRoundPlus size={18} /></span>
            <span className="grow" style={{ flex: 1 }}>
              <strong>Walk-in? Time in here</strong>
              <span className="subtle" style={{ display: 'block' }}>No account needed. Day pass {money(settings.walkin_fee)}, paid at the desk.</span>
            </span>
          </Link>
        )}

        {settings.demo_mode && (
          <section className="stack-sm" aria-label="Demo accounts">
            <p className="subtle">Demo accounts (sample data). An admin can turn this off in Gym settings.</p>
            <div className="demo-accounts">
              {DEMO.map((d) => (
                <button key={d.username} type="button" onClick={() => { setUsername(d.username); setPassword(d.password); }}>
                  <strong>{d.role}</strong>
                  <small>{d.username} / {d.password}</small>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
