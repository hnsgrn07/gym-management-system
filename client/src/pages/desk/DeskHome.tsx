import { Banknote, CalendarClock, LogIn, LogOut, RefreshCw, Search, UserPlus, UserRoundPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Avatar, Button, Checkbox, Dialog, Empty, Facts, LinkButton, LoadingRows, PageHeader, Panel, Pill, QueryError, StatusPill, TextField,
} from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtDuration, fmtTime, minutesBetween, money, relativeDay } from '../../lib/format';
import { useAction, useApi, useDebounced, useNow, useTitle } from '../../lib/hooks';
import type { InsideRow, Member, WalkinResult } from '../../lib/types';
import { CollectFeeDialog, MethodPicker, type Method } from './shared';

interface Summary {
  inside: InsideRow[];
  visits: { members: number; walkins: number };
  revenue: { total: number; n: number };
  expiring: Member[];
}

type Result = { kind: 'member'; m: Member } | { kind: 'walkin'; w: WalkinResult };

export default function DeskHome() {
  useTitle('Front desk');
  const { settings } = useAuth();
  const nav = useNavigate();
  useNow(30_000);
  const summary = useApi<Summary>('/desk/summary', { refetchInterval: 20_000 });
  const inside = summary.data?.inside ?? [];
  const insideByMember = useMemo(() => new Map(inside.filter((r) => r.member_id).map((r) => [r.member_id!, r])), [inside]);

  // ---- Search ----
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 150);
  const [sel, setSel] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const search = useApi<{ members: Member[]; walkins: WalkinResult[] }>(dq ? `/desk/search?q=${encodeURIComponent(dq)}` : null, { placeholderData: (p) => p });
  const results: Result[] = dq && search.data ? [...search.data.members.map((m) => ({ kind: 'member' as const, m })), ...search.data.walkins.map((w) => ({ kind: 'walkin' as const, w }))] : [];
  useEffect(() => setSel(0), [dq]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const reset = () => { setQ(''); searchRef.current?.focus(); };

  // ---- Actions ----
  const [override, setOverride] = useState<Member | null>(null);
  const [checkIn, checkingIn] = useAction(
    (m: Member, force = false) => api('/desk/checkin', { method: 'POST', body: { member_id: m.id, force }, queue: `Time in: ${m.full_name}` }),
    {
      success: (r: unknown) => `${(r as { name: string }).name} timed in`,
      invalidate: ['/desk'],
      onSuccess: () => { setOverride(null); reset(); },
      onError: (e: ApiError) => {
        if (e.code === 'MEMBERSHIP_INACTIVE') {
          const m = results.find((r) => r.kind === 'member' && e.message.startsWith(r.m.full_name));
          if (m && m.kind === 'member') { setOverride(m.m); return true; }
        }
        return false;
      },
    },
  );
  const [checkOut, checkingOut] = useAction(
    (row: { id: number; name: string }) => api('/desk/checkout', { method: 'POST', body: { attendance_id: row.id }, queue: `Time out: ${row.name}` }),
    { success: (r: unknown) => `Timed out · ${fmtDuration(minutesBetween((r as { time_in: string }).time_in, (r as { time_out: string }).time_out))}`, invalidate: ['/desk'], onSuccess: () => { if (q) reset(); } },
  );
  const [collectFor, setCollectFor] = useState<{ id: number; name: string } | null>(null);

  // ---- Walk-in form ----
  const [wName, setWName] = useState('');
  const [wPhone, setWPhone] = useState('');
  const [wPaid, setWPaid] = useState(true);
  const [wMethod, setWMethod] = useState<Method>('cash');
  const walkinRef = useRef<HTMLInputElement>(null);
  const [addWalkin, addingWalkin] = useAction(
    () => api('/desk/walkins', { method: 'POST', body: { full_name: wName, phone: wPhone || null, paid: wPaid, method: wMethod }, queue: `Walk-in: ${wName}` }),
    {
      success: () => `${wName} timed in${wPaid ? ` · ${money(settings.walkin_fee)} collected` : ' · fee not yet paid'}`,
      invalidate: ['/desk'],
      onSuccess: () => { setWName(''); setWPhone(''); setWPaid(true); },
    },
  );
  function prefillWalkin(w: WalkinResult) {
    setWName(w.full_name);
    setWPhone(w.phone ?? '');
    setQ('');
    walkinRef.current?.focus();
    walkinRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function primaryAction(r: Result) {
    if (r.kind === 'walkin') return prefillWalkin(r.w);
    const open = insideByMember.get(r.m.id);
    if (open) return void checkOut({ id: open.id, name: r.m.full_name });
    if (r.m.status === 'active' || r.m.status === 'expiring') return void checkIn(r.m);
    setOverride(r.m);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); primaryAction(results[sel]); }
    else if (e.key === 'Escape') setQ('');
  }

  const unpaid = inside.filter((r) => r.walkin_id && !r.paid);
  const membersIn = inside.filter((r) => r.member_id).length;

  return (
    <main className="content">
      <PageHeader
        title="Front desk"
        description={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={<>
          <Button icon={UserRoundPlus} onClick={() => { walkinRef.current?.focus(); walkinRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>Walk-in</Button>
          <LinkButton to="/desk/members/new" variant="primary" icon={UserPlus}>New member</LinkButton>
        </>}
      />

      <Facts items={[
        { label: <><span className="live-dot" /> In the gym now</>, value: inside.length, note: `${membersIn} members · ${inside.length - membersIn} walk-ins` },
        { label: 'Visits today', value: summary.data ? summary.data.visits.members + summary.data.visits.walkins : '–', note: summary.data ? `${summary.data.visits.walkins} walk-ins` : undefined },
        { label: 'Collected today', value: summary.data ? money(summary.data.revenue.total) : '–', note: summary.data ? `${summary.data.revenue.n} payments` : undefined },
        { label: 'Unpaid walk-ins', value: unpaid.length, note: unpaid.length ? 'Collect before they leave' : 'All settled', trend: unpaid.length ? 'down' : undefined },
      ]} />

      <div className="grid grid-main">
        <div className="stack">
          <Panel title="Time someone in or out" description="Search by name, member code, or phone." bodyClass={null}>
            <div className="panel-body">
              <div className="input-icon input-xl">
                <Search size={20} />
                <input ref={searchRef} className="input" type="search" autoFocus autoComplete="off" placeholder="Start typing a name or member code…"
                  value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} aria-label="Search members and walk-ins"
                  aria-controls="desk-results" aria-activedescendant={results[sel] ? `res-${sel}` : undefined} />
              </div>
              {!dq && <p className="subtle" style={{ marginTop: 'var(--s2)' }}>Press <kbd className="kbd">/</kbd> to search from anywhere, <kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> to choose, <kbd className="kbd">Enter</kbd> to time in or out.</p>}
            </div>
            {dq && (
              <ul className="list result-list" id="desk-results" role="listbox" aria-label="Results">
                {results.length === 0 && !search.isFetching && (
                  <li><div className="grow muted">No one matches “{dq}”.</div>
                    <div className="actions">
                      <Button size="sm" icon={UserRoundPlus} onClick={() => { setWName(dq); setQ(''); walkinRef.current?.focus(); }}>Add as walk-in</Button>
                      <Button size="sm" icon={UserPlus} onClick={() => nav(`/desk/members/new?name=${encodeURIComponent(dq)}`)}>New member</Button>
                    </div>
                  </li>
                )}
                {results.map((r, i) => r.kind === 'member' ? (
                  <MemberResult key={`m${r.m.id}`} id={`res-${i}`} m={r.m} selected={i === sel} open={insideByMember.get(r.m.id)}
                    busy={checkingIn || checkingOut} onPrimary={() => primaryAction(r)} onHover={() => setSel(i)} />
                ) : (
                  <li key={`w${r.w.id}`} id={`res-${i}`} role="option" aria-selected={i === sel} className={i === sel ? 'selected' : ''} onMouseEnter={() => setSel(i)}>
                    <Avatar name={r.w.full_name} walkin />
                    <div className="grow">
                      <strong>{r.w.full_name}</strong> <Pill tone="walkin" plain>Walk-in</Pill>
                      <div className="subtle">{r.w.phone ?? 'No phone'} · {r.w.visits} visits · last {relativeDay(r.w.last_visit)}</div>
                    </div>
                    <div className="actions">
                      <Button size="sm" variant="ghost" icon={UserPlus} onClick={() => nav(`/desk/members/new?walkin=${r.w.id}`)}>Make member</Button>
                      {r.w.inside ? <Pill tone="ok">In the gym</Pill> : <Button size="sm" icon={LogIn} onClick={() => prefillWalkin(r.w)}>Time in again</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={<span className="row"><span>In the gym now</span><span className="pill plain">{inside.length}</span></span>}
            actions={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => void summary.refetch()} aria-label="Refresh" />} bodyClass={null}>
            {summary.error ? <div className="panel-body"><QueryError error={summary.error} retry={summary.refetch} /></div>
              : !summary.data ? <LoadingRows />
              : inside.length ? (
                <div className="table-wrap">
                  <table className="table responsive">
                    <thead><tr><th>Name</th><th>In since</th><th>Payment</th><th className="right"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {inside.map((r) => (
                        <tr key={r.id}>
                          <td data-primary>
                            <div className="cell-person">
                              <Avatar name={r.name} walkin={!!r.walkin_id} />
                              <div>
                                {r.member_id ? <Link to={`/desk/members/${r.member_id}`} className="name">{r.name}</Link> : <span className="name">{r.name}</span>}
                                <div className="meta">{r.member_code ?? 'Walk-in'}{r.source === 'self' ? ' · self check-in' : ''}</div>
                              </div>
                            </div>
                          </td>
                          <td data-label="In since" className="tabular">{fmtTime(r.time_in)}<div className="subtle">{fmtDuration(minutesBetween(r.time_in))}</div></td>
                          <td data-label="Payment">{r.walkin_id ? (r.paid ? <Pill tone="ok" plain>Paid</Pill> : <Pill tone="bad">Unpaid</Pill>) : <Pill plain>Member</Pill>}</td>
                          <td className="right actions-cell">
                            <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', width: '100%' }}>
                              {r.walkin_id && <Button size="sm" variant="ghost" icon={UserPlus} aria-label={`Make ${r.name} a member`} title="Make member" onClick={() => nav(`/desk/members/new?walkin=${r.walkin_id}`)} />}
                              {r.walkin_id && !r.paid && <Button size="sm" icon={Banknote} onClick={() => setCollectFor({ id: r.id, name: r.name })}>Collect</Button>}
                              <Button size="sm" icon={LogOut} loading={checkingOut} onClick={() => void checkOut({ id: r.id, name: r.name })}>Time out</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty icon={Users} title="No one is in the gym">People appear here as soon as they’re timed in.</Empty>}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Walk-in" description={`Day pass · ${money(settings.walkin_fee)}`}>
            <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); if (wName.trim().length >= 2) void addWalkin(); }}>
              <TextField ref={walkinRef} label="Name" value={wName} onChange={(e) => setWName(e.target.value)} autoComplete="off" />
              <TextField label="Mobile number" optional type="tel" inputMode="tel" value={wPhone} onChange={(e) => setWPhone(e.target.value)}
                hint="Lets them time out from their own phone, and finds them next visit." />
              <Checkbox label={`Paid ${money(settings.walkin_fee)} now`} checked={wPaid} onChange={(e) => setWPaid(e.target.checked)}
                hint={wPaid ? undefined : 'They’ll show as Unpaid until you collect.'} />
              {wPaid && <MethodPicker value={wMethod} onChange={setWMethod} />}
              <Button type="submit" variant="primary" block icon={LogIn} loading={addingWalkin} disabled={wName.trim().length < 2}>Time in walk-in</Button>
            </form>
          </Panel>

          <Panel title="Expiring soon" description={`Ending within ${settings.expiring_days} days. Remind them to renew.`} bodyClass={null}>
            {summary.data?.expiring.length ? (
              <ul className="list">
                {summary.data.expiring.map((m) => (
                  <li key={m.id}>
                    <Avatar name={m.full_name} />
                    <div className="grow">
                      <Link to={`/desk/members/${m.id}`}><strong>{m.full_name}</strong></Link>
                      <div className="subtle">Ends {fmtDate(m.paid_through, { month: 'short', day: 'numeric' })}</div>
                    </div>
                    <StatusPill status={m.status} daysLeft={m.days_left} />
                  </li>
                ))}
              </ul>
            ) : <Empty icon={CalendarClock} title="No renewals due">No memberships end in the next {settings.expiring_days} days.</Empty>}
          </Panel>
        </div>
      </div>

      <Dialog open={!!override} onClose={() => setOverride(null)}
        title={override?.status === 'none' ? `${override?.full_name} has no membership` : `${override?.full_name}’s membership ${override?.status === 'pending' ? 'hasn’t started' : 'has expired'}`}
        description={override?.paid_through ? `Paid through ${fmtDate(override.paid_through)}.` : 'Sell a plan, or let them in this once (it’s recorded in the activity log).'}
        footer={<>
          <Button onClick={() => setOverride(null)}>Cancel</Button>
          <Button onClick={() => override && void checkIn(override, true)} loading={checkingIn}>Time in anyway</Button>
          <Button variant="primary" onClick={() => override && nav(`/desk/members/${override.id}#renew`)}>Renew membership</Button>
        </>} />
      <CollectFeeDialog visit={collectFor} onClose={() => setCollectFor(null)} />
    </main>
  );
}

function MemberResult({ m, id, selected, open, busy, onPrimary, onHover }: {
  m: Member; id: string; selected: boolean; open?: InsideRow; busy: boolean; onPrimary: () => void; onHover: () => void;
}) {
  const nav = useNavigate();
  const ok = m.status === 'active' || m.status === 'expiring';
  return (
    <li id={id} role="option" aria-selected={selected} className={selected ? 'selected' : ''} onMouseEnter={onHover}>
      <Avatar name={m.full_name} />
      <div className="grow">
        <Link to={`/desk/members/${m.id}`}><strong>{m.full_name}</strong></Link>
        <div className="subtle">{m.member_code}{m.phone ? ` · ${m.phone}` : ''}{open ? ` · in since ${fmtTime(open.time_in)}` : ''}</div>
      </div>
      <StatusPill status={m.status} daysLeft={m.days_left} />
      <div className="actions">
        {!ok && !open && <Button size="sm" onClick={() => nav(`/desk/members/${m.id}#renew`)}>Renew</Button>}
        {open ? <Button size="sm" icon={LogOut} loading={busy} onClick={onPrimary}>Time out</Button>
          : <Button size="sm" variant={ok ? 'primary' : 'secondary'} icon={LogIn} loading={busy} onClick={onPrimary}>Time in</Button>}
      </div>
    </li>
  );
}
