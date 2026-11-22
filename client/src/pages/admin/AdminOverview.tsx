import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BarChart } from '../../components/charts';
import { Facts, LoadingRows, PageHeader, Panel, QueryError, Segmented } from '../../components/ui';
import { addDays, fmtDate, localDate, methodLabel, money } from '../../lib/format';
import { useApi, useTitle } from '../../lib/hooks';

interface Report {
  from: string; to: string;
  revenueByDay: { d: string; membership: number; walkin: number; other: number }[];
  visitsByDay: { d: string; members: number; walkins: number }[];
  byHour: { h: number; n: number }[];
  byMethod: { method: string; total: number }[];
  plans: { name: string; sold: number; total: number }[];
  memberCounts: Record<'active' | 'expiring' | 'expired' | 'pending' | 'none', number>;
  newMembers: number;
}

type Range = '7' | '30' | '90';

function fillDays<T extends { d: string }>(from: string, to: string, rows: T[], empty: Omit<T, 'd'>): T[] {
  const map = new Map(rows.map((r) => [r.d, r]));
  const out: T[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(map.get(d) ?? ({ d, ...empty } as T));
  return out;
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });

export default function AdminOverview() {
  useTitle('Overview');
  const [range, setRange] = useState<Range>('30');
  const to = localDate();
  const from = addDays(to, -(Number(range) - 1));
  const { data, error, refetch } = useApi<Report>(`/admin/reports?from=${from}&to=${to}`);
  // Previous period of the same length, for comparison.
  const prev = useApi<Report>(`/admin/reports?from=${addDays(from, -Number(range))}&to=${addDays(from, -1)}`);

  const days = useMemo(() => data ? fillDays(data.from, data.to, data.revenueByDay, { membership: 0, walkin: 0, other: 0 }) : [], [data]);
  const visits = useMemo(() => data ? fillDays(data.from, data.to, data.visitsByDay, { members: 0, walkins: 0 }) : [], [data]);
  const sum = (r?: Report) => r?.revenueByDay.reduce((a, d) => a + d.membership + d.walkin + d.other, 0) ?? 0;
  const vsum = (r?: Report) => r?.visitsByDay.reduce((a, d) => a + d.members + d.walkins, 0) ?? 0;
  const delta = (cur: number, before: number) => {
    if (!prev.data || !before) return undefined;
    const pct = Math.round(((cur - before) / before) * 100);
    return { note: `${pct >= 0 ? '+' : ''}${pct}% vs previous ${range} days`, trend: pct >= 0 ? ('up' as const) : ('down' as const) };
  };
  const revenue = sum(data);
  const visitTotal = vsum(data);
  const short = (d: string) => fmtDate(d, Number(range) > 31 ? { month: 'short', day: 'numeric' } : { day: 'numeric' });
  const peak = data?.byHour.reduce((a, b) => (b.n > a.n ? b : a), { h: 0, n: 0 });
  const counts = data?.memberCounts;
  const activeTotal = counts ? counts.active + counts.expiring : 0;
  const allMembers = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <main className="content">
      <PageHeader title="Overview" description={data ? `${fmtDate(data.from)} to ${fmtDate(data.to)}` : 'Revenue, attendance, and memberships'}
        actions={<>
          <Segmented<Range> label="Date range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        </>} />
      {error && <QueryError error={error} retry={refetch} />}
      {!data ? <Panel><LoadingRows rows={6} /></Panel> : <>
        <Facts items={[
          { label: 'Revenue', value: money(revenue, { compact: true }), ...delta(revenue, sum(prev.data)) },
          { label: 'Visits', value: visitTotal.toLocaleString(), ...delta(visitTotal, vsum(prev.data)) },
          { label: 'Active members', value: activeTotal, note: `${counts?.expiring ?? 0} expiring soon · ${counts?.expired ?? 0} expired` },
          { label: 'New members', value: data.newMembers, note: `in the last ${range} days` },
        ]} />

        <div className="grid grid-2">
          <Panel title="Revenue per day">
            <BarChart ariaLabel="Revenue per day" format={(v) => money(v, { compact: true })}
              series={[{ name: 'Memberships', color: 'var(--chart-1)' }, { name: 'Walk-ins', color: 'var(--chart-2)' }, { name: 'Other', color: 'var(--chart-3)' }].slice(0, days.some((d) => d.other) ? 3 : 2)}
              data={days.map((d) => ({ label: short(d.d), tip: fmtDate(d.d, { weekday: 'short', month: 'short', day: 'numeric' }), values: [d.membership, d.walkin, d.other] }))} />
          </Panel>
          <Panel title="Visits per day">
            <BarChart ariaLabel="Visits per day"
              series={[{ name: 'Members', color: 'var(--chart-1)' }, { name: 'Walk-ins', color: 'var(--chart-2)' }]}
              data={visits.map((d) => ({ label: short(d.d), tip: fmtDate(d.d, { weekday: 'short', month: 'short', day: 'numeric' }), values: [d.members, d.walkins] }))} />
          </Panel>
        </div>

        <div className="grid grid-3">
          <Panel title="Busiest hours" description={peak?.n ? `Peak around ${hourLabel(peak.h)}. Plan staffing around it.` : undefined}>
            <BarChart ariaLabel="Time-ins by hour of day" height={180} legend={false}
              series={[{ name: 'Time-ins', color: 'var(--chart-1)' }]}
              data={Array.from({ length: 18 }, (_, i) => i + 5).map((h) => ({ label: hourLabel(h), tip: hourLabel(h), values: [data.byHour.find((x) => x.h === h)?.n ?? 0] }))} />
          </Panel>
          <Panel title="Membership status" description={`${allMembers} member accounts`}>
            <div className="stack">
              {([['active', 'Active', 'var(--ok)'], ['expiring', 'Expiring soon', 'var(--warn)'], ['expired', 'Expired', 'var(--bad)'], ['none', 'No plan yet', 'var(--text-3)']] as const).map(([k, label, color]) => (
                <div key={k} className="stack-sm" style={{ gap: 4 }}>
                  <div className="row-between"><span>{label}</span><strong className="tabular">{counts?.[k] ?? 0}</strong></div>
                  <div className="meter"><span style={{ width: `${allMembers ? ((counts?.[k] ?? 0) / allMembers) * 100 : 0}%`, background: color }} /></div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Payment methods">
            {data.byMethod.length ? (
              <div className="stack">
                {data.byMethod.map((m) => (
                  <div key={m.method} className="stack-sm" style={{ gap: 4 }}>
                    <div className="row-between"><span>{methodLabel(m.method)}</span><strong className="tabular">{money(m.total)}</strong></div>
                    <div className="meter"><span style={{ width: `${revenue ? (m.total / revenue) * 100 : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No payments in this period.</p>}
          </Panel>
        </div>

        <div className="grid grid-main">
          <Panel title="Plans sold" bodyClass={null}>
            {data.plans.length ? (
              <table className="table">
                <thead><tr><th>Plan</th><th className="right">Sold</th><th className="right">Revenue</th></tr></thead>
                <tbody>{data.plans.map((p) => <tr key={p.name}><td><strong>{p.name}</strong></td><td className="right">{p.sold}</td><td className="right">{money(p.total)}</td></tr>)}</tbody>
              </table>
            ) : <div className="panel-body"><p className="muted">No plans sold in this period.</p></div>}
          </Panel>
          <Panel title="Export" description="Download spreadsheets (CSV) for this date range.">
            <div className="stack-sm">
              <a className="btn" href={`/api/admin/export/attendance.csv?from=${from}&to=${to}`}><Download size={18} /> Attendance</a>
              <a className="btn" href={`/api/admin/export/payments.csv?from=${from}&to=${to}`}><Download size={18} /> Payments</a>
              <a className="btn" href="/api/admin/export/members.csv"><Download size={18} /> Member list</a>
            </div>
          </Panel>
        </div>
      </>}
    </main>
  );
}
