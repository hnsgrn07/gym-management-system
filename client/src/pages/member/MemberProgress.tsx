import { useState } from 'react';
import { StatsPanels } from '../../components/stats';
import { Button, Dialog, LoadingRows, PageHeader, Panel, QueryError } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { useAction, useApi, useTitle } from '../../lib/hooks';
import type { Stat } from '../../lib/types';

export default function MemberProgress() {
  useTitle('Progress');
  const { user } = useAuth();
  const { data, error, refetch, isLoading } = useApi<Stat[]>('/member/stats');
  const [confirm, setConfirm] = useState<Stat | null>(null);
  const [remove, removing] = useAction((id: number) => api(`/member/stats/${id}`, { method: 'DELETE' }), {
    success: 'Entry deleted', invalidate: ['/member'], onSuccess: () => setConfirm(null),
  });

  return (
    <main className="content">
      <PageHeader title="Progress" description="Your body stats over time. Your coach sees these too." />
      {error && <QueryError error={error} retry={refetch} />}
      {isLoading && <Panel><LoadingRows /></Panel>}
      {data && (
        <StatsPanels stats={data} endpoint="/member/stats" invalidate={['/member']}
          canDelete={(s) => s.recorded_by === user?.id} onDelete={setConfirm} />
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="Delete this entry?"
        description={confirm ? `Measurements from ${fmtDate(confirm.recorded_on)} will be removed. This can’t be undone.` : undefined}
        footer={<>
          <Button onClick={() => setConfirm(null)}>Keep it</Button>
          <Button variant="danger-solid" loading={removing} onClick={() => confirm && void remove(confirm.id)}>Delete entry</Button>
        </>} />
    </main>
  );
}
