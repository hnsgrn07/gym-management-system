import { LogIn, LogOut } from 'lucide-react';
import { api, isQueued } from '../../lib/api';
import { fmtDuration, fmtTime, minutesBetween } from '../../lib/format';
import { useAction, useNow } from '../../lib/hooks';
import type { MembershipStatus } from '../../lib/types';
import { Button, Notice } from '../../components/ui';

/** The big Time in / Time out control on the member's Today page. */
export function TimeClock({ open, status, onQueued }: {
  open: { id: number; time_in: string } | null;
  status: MembershipStatus;
  onQueued: (action: 'in' | 'out') => void;
}) {
  useNow(15_000);
  const blocked = !open && (status === 'expired' || status === 'none' || status === 'pending');
  const [toggle, busy] = useAction(() => api('/member/attendance/toggle', { method: 'POST', body: {}, queue: open ? 'Time out' : 'Time in' }), {
    success: (r: unknown) => ((r as { action: string }).action === 'in' ? 'Timed in. Have a great session!' : 'Timed out. Nice work today.'),
    queued: 'Your time was recorded on this phone and will sync when the connection is back.',
    invalidate: ['/member'],
    onSuccess: (r) => { if (isQueued(r)) onQueued(open ? 'out' : 'in'); },
  });

  return (
    <div className="clock">
      {open ? (
        <div className="stack-sm">
          <div className="clock-state"><span className="live-dot" /><strong>You’re in the gym</strong></div>
          <div className="clock-timer" aria-live="off">{fmtDuration(minutesBetween(open.time_in))}</div>
          <p className="muted">Timed in at {fmtTime(open.time_in)}</p>
        </div>
      ) : (
        <div className="stack-sm">
          <div className="clock-state"><strong>You’re not timed in</strong></div>
          <p className="muted">Tap the button when you arrive, and again when you leave.</p>
        </div>
      )}
      {blocked ? (
        <Notice tone="warn" title="Your membership isn’t active">
          {status === 'pending' ? 'Your plan starts later. ' : ''}Renew at the front desk to time in. Staff can also time you in there.
        </Notice>
      ) : (
        <Button variant={open ? 'secondary' : 'primary'} size="lg" block className="clock-btn" icon={open ? LogOut : LogIn} loading={busy} onClick={() => void toggle()}>
          {open ? 'Time out' : 'Time in'}
        </Button>
      )}
    </div>
  );
}
