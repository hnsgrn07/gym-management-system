import { CalendarDays, ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Button, Empty, Facts, LoadingRows, PageHeader, Panel, Pill, QueryError, Tabs } from '../../components/ui';
import { addDays, fmtDate, fmtDuration, fmtTime, localDate, methodLabel, minutesBetween, money } from '../../lib/format';
import { useApi, useTitle } from '../../lib/hooks';
import type { Payment } from '../../lib/types';

interface LogRow {
  id: number; date: string; time_in: string; time_out: string | null; auto_closed: number; source: string;
  member_id: number | null; walkin_id: number | null; name: string; member_code: string | null; paid: number; recorded_by_name: string | null;
}

export default function DeskLog() {
  useTitle('Daily log');
  const [date, setDate] = useState(localDate());
  const [tab, setTab] = useState<'visits' | 'payments'>('visits');
  const visits = useApi<LogRow[]>(`/desk/attendance?date=${date}`);
  const payments = useApi<(Payment & { payer: string | null })[]>(`/desk/payments?date=${date}`);
  const isToday = date === localDate();
  const total = payments.data?.reduce((a, p) => a + p.amount, 0) ?? 0;
  const byMethod = payments.data?.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.method]: (acc[p.method] ?? 0) + p.amount }), {}) ?? {};

  return (
    <main className="content">
      <PageHeader title="Daily log" description="Every time in, time out, and payment for one day."
        actions={
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Button icon={ChevronLeft} aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} />
            <input className="input" type="date" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" style={{ width: 170 }} />
            <Button icon={ChevronRight} aria-label="Next day" disabled={isToday} onClick={() => setDate(addDays(date, 1))} />
            {!isToday && <Button onClick={() => setDate(localDate())}>Today</Button>}
          </div>
        } />
      <Facts items={[
        { label: 'Visits', value: visits.data?.length ?? '–', note: visits.data ? `${visits.data.filter((v) => v.walkin_id).length} walk-ins` : undefined },
        { label: 'Collected', value: payments.data ? money(total) : '–', note: Object.entries(byMethod).map(([m, v]) => `${methodLabel(m)} ${money(v)}`).join(' · ') || undefined },
        { label: 'Unpaid walk-ins', value: visits.data?.filter((v) => v.walkin_id && !v.paid).length ?? '–' },
        { label: 'Forgot to time out', value: visits.data?.filter((v) => v.auto_closed).length ?? '–' },
      ]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'visits', label: `Visits${visits.data ? ` (${visits.data.length})` : ''}` }, { value: 'payments', label: `Payments${payments.data ? ` (${payments.data.length})` : ''}` }]} />

      {tab === 'visits' && (
        <Panel bodyClass={null}>
          {visits.error ? <div className="panel-body"><QueryError error={visits.error} retry={visits.refetch} /></div> : !visits.data ? <LoadingRows /> : visits.data.length ? (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Name</th><th>Time in</th><th>Time out</th><th>Duration</th><th>Type</th><th>Recorded by</th></tr></thead>
                <tbody>
                  {visits.data.map((v) => (
                    <tr key={v.id}>
                      <td data-primary>
                        <div className="cell-person">
                          <Avatar name={v.name} walkin={!!v.walkin_id} />
                          <div>
                            {v.member_id ? <Link className="name" to={`/desk/members/${v.member_id}`}>{v.name}</Link> : <span className="name">{v.name}</span>}
                            <div className="meta">{v.member_code ?? 'Walk-in'}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="In" className="tabular">{fmtTime(v.time_in)}</td>
                      <td data-label="Out" className="tabular">{v.time_out ? (v.auto_closed ? <Pill tone="warn" plain>Forgot to time out</Pill> : fmtTime(v.time_out)) : <Pill tone="ok">Still in</Pill>}</td>
                      <td data-label="Duration" className="tabular">{v.auto_closed ? '—' : fmtDuration(minutesBetween(v.time_in, v.time_out))}</td>
                      <td data-label="Type">{v.walkin_id ? (v.paid ? <Pill tone="walkin" plain>Walk-in · paid</Pill> : <Pill tone="bad">Walk-in · unpaid</Pill>) : <Pill plain>Member</Pill>}</td>
                      <td data-label="By" className="hide-sm">{v.source === 'self' ? 'Self (phone)' : v.recorded_by_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={CalendarDays} title={`No visits on ${fmtDate(date)}`} />}
        </Panel>
      )}
      {tab === 'payments' && (
        <Panel bodyClass={null}>
          {!payments.data ? <LoadingRows /> : payments.data.length ? (
            <div className="table-wrap">
              <table className="table responsive">
                <thead><tr><th>Time</th><th>From</th><th>For</th><th>Method</th><th>Received by</th><th className="right">Amount</th></tr></thead>
                <tbody>
                  {payments.data.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Time" className="tabular">{fmtTime(p.created_at)}</td>
                      <td data-primary><strong>{p.payer ?? '—'}</strong></td>
                      <td data-label="For">{p.note ?? p.kind}</td>
                      <td data-label="Method">{methodLabel(p.method)}</td>
                      <td data-label="By" className="hide-sm">{p.received_by_name ?? '—'}</td>
                      <td data-label="Amount" className="right tabular"><strong>{money(p.amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={Receipt} title={`No payments on ${fmtDate(date)}`} />}
        </Panel>
      )}
    </main>
  );
}
