const pad = (n: number) => String(n).padStart(2, '0');

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function localDateTime(d = new Date()) {
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d + days));
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" as local time. */
export function parseLocal(value: string): Date {
  const [date, time = '00:00:00'] = value.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss || 0);
}

let currency = 'USD';
export function setCurrency(code: string) {
  currency = code || 'USD';
}
export function money(n: number | null | undefined, opts: { compact?: boolean } = {}) {
  const value = n ?? 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: opts.compact || Number.isInteger(value) ? 0 : 2,
      notation: opts.compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function fmtDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  return parseLocal(value).toLocaleDateString(undefined, opts);
}
export function fmtDay(value: string) {
  return fmtDate(value, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtTime(value: string | null | undefined) {
  if (!value) return '—';
  return parseLocal(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return `${fmtDate(value, { month: 'short', day: 'numeric' })}, ${fmtTime(value)}`;
}

export function minutesBetween(from: string, to?: string | null) {
  const end = to ? parseLocal(to) : new Date();
  return Math.max(0, Math.round((end.getTime() - parseLocal(from).getTime()) / 60000));
}
export function fmtDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
/** "Today", "Yesterday", "3 days ago", or a date. */
export function relativeDay(value: string | null | undefined) {
  if (!value) return 'Never';
  const days = Math.round((parseLocal(localDate()).getTime() - parseLocal(value.slice(0, 10)).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(value, { month: 'short', day: 'numeric' });
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function bmiCategory(bmi: number | null | undefined): { label: string; tone: 'ok' | 'warn' | 'bad' | '' } {
  if (!bmi) return { label: '', tone: '' };
  if (bmi < 18.5) return { label: 'Underweight', tone: 'warn' };
  if (bmi < 25) return { label: 'Healthy range', tone: 'ok' };
  if (bmi < 30) return { label: 'Overweight', tone: 'warn' };
  return { label: 'Obese range', tone: 'bad' };
}

export function computeBmi(weight?: number | null, heightCm?: number | null) {
  if (!weight || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weight / (m * m)) * 10) / 10;
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
] as const;
export const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
