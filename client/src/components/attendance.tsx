import { fmtDay, fmtDuration, fmtTime, minutesBetween } from '../lib/format';
import type { Attendance } from '../lib/types';
import { Pill } from './ui';

/** One person's visits: date, time in, time out, duration. */
export function AttendanceTable({ rows }: { rows: Attendance[] }) {
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th className="right">Duration</th></tr></thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td data-primary data-label="Date"><strong>{fmtDay(a.date)}</strong></td>
              <td data-label="In">{fmtTime(a.time_in)}</td>
              <td data-label="Out">
                {a.time_out ? (a.auto_closed ? <Pill tone="warn" plain>Forgot to time out</Pill> : fmtTime(a.time_out)) : <Pill tone="ok">In the gym</Pill>}
              </td>
              <td data-label="Duration" className="right tabular">{a.time_out && !a.auto_closed ? fmtDuration(minutesBetween(a.time_in, a.time_out)) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
