import { Banknote } from 'lucide-react';
import { useState } from 'react';
import { Button, Dialog, Segmented } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money, PAYMENT_METHODS } from '../../lib/format';
import { useAction } from '../../lib/hooks';

export type Method = (typeof PAYMENT_METHODS)[number]['value'];

export function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="field">
      <span className="field-label">Payment method</span>
      <Segmented<Method> label="Payment method" value={value} onChange={onChange} options={PAYMENT_METHODS.slice(0, 4).map((m) => ({ value: m.value, label: m.label }))} />
    </div>
  );
}

/** Confirm collecting a walk-in's day fee. */
export function CollectFeeDialog({ visit, onClose }: { visit: { id: number; name: string } | null; onClose: () => void }) {
  const { settings } = useAuth();
  const [method, setMethod] = useState<Method>('cash');
  const [collect, busy] = useAction((id: number) => api(`/desk/attendance/${id}/pay`, { method: 'POST', body: { method } }), {
    success: `Collected ${money(settings.walkin_fee)}`, invalidate: ['/desk', '/admin'], onSuccess: onClose,
  });
  return (
    <Dialog open={!!visit} onClose={onClose} title={`Collect ${money(settings.walkin_fee)} from ${visit?.name ?? ''}`}
      description="Walk-in day pass."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={Banknote} loading={busy} onClick={() => visit && void collect(visit.id)}>Mark as paid</Button>
      </>}>
      <MethodPicker value={method} onChange={setMethod} />
    </Dialog>
  );
}
