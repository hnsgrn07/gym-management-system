import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { useNet } from '../lib/hooks';
import { Button, Dialog } from './ui';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}
type Confirm = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(async () => true);

/** `const confirm = useConfirm(); if (await confirm({...})) doIt();` */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const confirm = useCallback<Confirm>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOpts(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!opts} onClose={() => close(false)} title={opts?.title ?? ''} description={opts?.description}
        footer={<>
          <Button onClick={() => close(false)}>{opts?.cancelLabel ?? 'Cancel'}</Button>
          <Button variant={opts?.tone === 'danger' ? 'danger-solid' : 'primary'} onClick={() => close(true)} autoFocus>{opts?.confirmLabel}</Button>
        </>} />
    </ConfirmContext.Provider>
  );
}

/** Sign out after confirming; warns when offline entries would be lost. */
export function useSignOut() {
  const confirm = useConfirm();
  const { logout } = useAuth();
  const net = useNet();
  return async () => {
    const ok = await confirm({
      title: 'Sign out?',
      description: net.pending
        ? `${net.pending} saved ${net.pending === 1 ? 'entry hasn’t' : 'entries haven’t'} synced yet and will be lost. Reconnect to the gym Wi-Fi first if you can.`
        : 'Saved offline data is cleared from this device. You’ll need your password to sign back in.',
      confirmLabel: 'Sign out',
      tone: net.pending ? 'danger' : 'primary',
    });
    if (ok) await logout();
  };
}
