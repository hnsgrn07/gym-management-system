import { CalendarDays, Receipt } from 'lucide-react';
import { useState } from 'react';
import { AttendanceTable } from '../../components/attendance';
import { Empty, LoadingRows, PageHeader, Panel, QueryError, Tabs } from '../../components/ui';
import { fmtDate, fmtDateTime, methodLabel, money } from '../../lib/format';
import { useApi, useTitle } from '../../lib/hooks';
import type { Attendance, Membership, Payment } from '../../lib/types';

export default function MemberHistory() {
  useTitle('History');
  const [tab, setTab] = useState<'visits' | 'membership'>('visits');
  const visits = useApi<Attendance[]>('/member/attendance');
  const ms = useApi<{ memberships: Membership[]; payments: Payment[] }>(tab === 'membership' ? '/member/memberships' : null);

  return (
    <main className="content">
      <PageHeader title="History" description="Every visit with time in, time out, and date, plus your membership record." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'visits', label: 'Visits' }, { value: 'membership', label: 'Membership & payments' }]} />
      {tab === 'visits' && (
        <Panel bodyClass={null}>
          {visits.error ? <div className="panel-body"><QueryError error={visits.error} retry={visits.refetch} /></div>
            : !visits.data ? <LoadingRows />
            : visits.data.length ? <AttendanceTable rows={visits.data} />
            : <Empty icon={CalendarDays} title="No visits yet">Time in from the Today page when you arrive at the gym.</Empty>}
        </Panel>
      )}
      {tab === 'membership' && (
        <div className="grid grid-2">
          <Panel title="Plans" bodyClass={null}>
            {!ms.data ? <LoadingRows /> : ms.data.memberships.length ? (
              <ul className="list">
                {ms.data.memberships.map((m) => (
                  <li key={m.id}>
                    <div className="grow"><strong>{m.plan_name}</strong><div className="subtle">{fmtDate(m.start_date)} to {fmtDate(m.end_date)}</div></div>
                    <span className="tabular">{money(m.price_paid)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={Receipt} title="No plans yet">Buy a plan at the front desk to start training.</Empty>}
          </Panel>
          <Panel title="Payments" bodyClass={null}>
            {!ms.data ? <LoadingRows /> : ms.data.payments.length ? (
              <ul className="list">
                {ms.data.payments.map((p) => (
                  <li key={p.id}>
                    <div className="grow"><strong>{p.note ?? 'Payment'}</strong><div className="subtle">{fmtDateTime(p.created_at)} · {methodLabel(p.method)}</div></div>
                    <span className="tabular">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={Receipt} title="No payments recorded" />}
          </Panel>
        </div>
      )}
    </main>
  );
}
