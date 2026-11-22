import { ArrowLeft, CircleAlert, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import {
  forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes, type CSSProperties,
} from 'react';
import { Link } from 'react-router';
import { initials } from '../lib/format';
import type { MembershipStatus } from '../lib/types';

// ---------- Buttons ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, loading, icon: Icon, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', !children && 'btn-icon', className]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <LoaderCircle size={iconSize} className="spin" aria-hidden /> : Icon && <Icon size={iconSize} aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({ to, variant = 'secondary', size = 'md', icon: Icon, children, block }: {
  to: string; variant?: ButtonProps['variant']; size?: ButtonProps['size']; icon?: LucideIcon; children?: ReactNode; block?: boolean;
}) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block'].filter(Boolean).join(' ');
  return (
    <Link to={to} className={cls}>
      {Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden />}
      {children}
    </Link>
  );
}

// ---------- Form fields ----------

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (id: string, describedBy?: string) => ReactNode;
}
export function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {error ? <span id={errId} className="field-error">{error}</span> : hint ? <span id={hintId} className="field-hint">{hint}</span> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; unit?: string };
export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField({ label, hint, error, optional, unit, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {(id, describedBy) => {
        const input = <input ref={ref} id={id} className="input" aria-describedby={describedBy} aria-invalid={!!error || undefined} {...rest} />;
        return unit ? <div className="input-unit">{input}<span>{unit}</span></div> : input;
      }}
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; optional?: boolean };
export function SelectField({ label, hint, optional, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} optional={optional}>
      {(id, describedBy) => <select id={id} className="select" aria-describedby={describedBy} {...rest}>{children}</select>}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; optional?: boolean };
export function TextareaField({ label, hint, optional, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} optional={optional}>
      {(id, describedBy) => <textarea id={id} className="textarea" aria-describedby={describedBy} {...rest} />}
    </Field>
  );
}

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>
        <span className="check-label">{label}</span>
        {hint && <span className="check-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, block }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; label: string; block?: boolean;
}) {
  return (
    <div className={`segmented${block ? ' block' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Layout ----------

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link to={back.to} className="back-link">
            <ArrowLeft size={16} aria-hidden /> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, actions, children, footer, bodyClass = 'panel-body', id }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; bodyClass?: string | null; id?: string;
}) {
  return (
    <section className="panel" id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="subtle">{description}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {bodyClass ? <div className={bodyClass}>{children}</div> : children}
      {footer && <div className="panel-foot">{footer}</div>}
    </section>
  );
}

export function Facts({ items }: { items: { label: ReactNode; value: ReactNode; note?: ReactNode; trend?: 'up' | 'down' }[] }) {
  return (
    <div className="facts">
      {items.map((f, i) => (
        <div className="fact" key={i}>
          <span className="fact-label">{f.label}</span>
          <span className="fact-value">{f.value}</span>
          {f.note && <span className={`fact-note ${f.trend ?? ''}`}>{f.note}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- Status ----------

const STATUS: Record<MembershipStatus, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'ok' },
  expiring: { label: 'Expiring soon', tone: 'warn' },
  expired: { label: 'Expired', tone: 'bad' },
  pending: { label: 'Starts later', tone: '' },
  none: { label: 'No membership', tone: '' },
};
export function StatusPill({ status, daysLeft, size }: { status: MembershipStatus; daysLeft?: number | null; size?: 'lg' }) {
  const s = STATUS[status];
  let label = s.label;
  if (status === 'expiring' && daysLeft != null) label = daysLeft === 0 ? 'Ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  return <span className={`pill ${s.tone} ${size ?? ''}`}>{label}</span>;
}
export const statusLabel = (s: MembershipStatus) => STATUS[s].label;

export function Pill({ tone = '', children, plain }: { tone?: 'ok' | 'warn' | 'bad' | 'walkin' | 'primary' | ''; children: ReactNode; plain?: boolean }) {
  return <span className={`pill ${tone}${plain ? ' plain' : ''}`}>{children}</span>;
}

export function Avatar({ name, walkin, size }: { name: string; walkin?: boolean; size?: 'lg' }) {
  return <span className={`avatar${walkin ? ' walkin' : ''}${size ? ` ${size}` : ''}`} aria-hidden>{initials(name)}</span>;
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'ok' | 'warn' | 'bad'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'bad' ? CircleAlert : tone === 'warn' ? TriangleAlert : Info;
  return (
    <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden />
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
        {action}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.6} aria-hidden />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden />;
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack-sm" style={{ padding: 'var(--s5)' }} aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={40} />)}
    </div>
  );
}

export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Notice tone="bad" title="Couldn’t load this" action={retry && <div><Button size="sm" onClick={retry}>Try again</Button></div>}>
      {error instanceof Error ? error.message : 'Something went wrong.'}
    </Notice>
  );
}

// ---------- Dialog (native <dialog>, used only for confirmations) ----------

export function Dialog({ open, onClose, title, description, children, footer }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children?: ReactNode; footer: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="dlg-title">
      <div className="dialog-head">
        <h2 id="dlg-title">{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {children && <div className="dialog-body">{children}</div>}
      <div className="dialog-foot">{footer}</div>
    </dialog>
  );
}
