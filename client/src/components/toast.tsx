import { CircleAlert, CircleCheck, CloudOff, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'bad' | 'warn' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  text?: string;
}
type Push = (t: Omit<Toast, 'id'>) => void;

const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

let seq = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((t) => {
    const id = ++seq;
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === 'bad' ? 6500 : 4000);
  }, []);
  const Icon = { ok: CircleCheck, bad: CircleAlert, warn: CloudOff, info: Info };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} className={`toast ${t.tone}`}>
              <I size={18} aria-hidden />
              <div>
                <div className="toast-title">{t.title}</div>
                {t.text && <div className="toast-text">{t.text}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
