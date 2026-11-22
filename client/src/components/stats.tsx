import { Plus, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { bmiCategory, computeBmi, fmtDate, localDate } from '../lib/format';
import { useAction } from '../lib/hooks';
import type { Stat } from '../lib/types';
import { LineChart } from './charts';
import { Button, Empty, Panel, Segmented, TextareaField, TextField } from './ui';

const FIELDS = [
  ['weight_kg', 'Weight', 'kg'], ['height_cm', 'Height', 'cm'], ['body_fat_pct', 'Body fat', '%'], ['muscle_pct', 'Muscle mass', '%'],
  ['waist_cm', 'Waist', 'cm'], ['chest_cm', 'Chest', 'cm'], ['hips_cm', 'Hips', 'cm'], ['arm_cm', 'Arm', 'cm'], ['thigh_cm', 'Thigh', 'cm'],
  ['resting_hr', 'Resting heart rate', 'bpm'],
] as const;
type FieldKey = (typeof FIELDS)[number][0];

/** Log a new set of measurements. Height prefills from the last entry since it rarely changes. */
export function StatsForm({ endpoint, lastHeight, invalidate, onDone }: { endpoint: string; lastHeight?: number | null; invalidate: string[]; onDone?: () => void }) {
  const empty = (): Record<FieldKey, string> => Object.fromEntries(FIELDS.map(([k]) => [k, k === 'height_cm' && lastHeight ? String(lastHeight) : ''])) as Record<FieldKey, string>;
  const [values, setValues] = useState(empty);
  const [date, setDate] = useState(localDate());
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(false);
  const num = (k: FieldKey) => (values[k] === '' ? null : Number(values[k]));
  const bmi = computeBmi(num('weight_kg'), num('height_cm'));
  const cat = bmiCategory(bmi);
  const hasAny = FIELDS.some(([k]) => values[k] !== '' && !(k === 'height_cm' && values[k] === String(lastHeight ?? '')));

  const [save, saving] = useAction(
    () => api(endpoint, {
      method: 'POST',
      queue: 'Body stats',
      body: { recorded_on: date, notes: notes || null, ...Object.fromEntries(FIELDS.map(([k]) => [k, num(k)])) },
    }),
    { success: 'Measurements saved', invalidate, onSuccess: () => { setValues(empty()); setNotes(''); onDone?.(); } },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }
  const field = ([k, label, unit]: (typeof FIELDS)[number]) => (
    <TextField key={k} label={label} unit={unit} type="number" inputMode="decimal" step="0.1" min="0"
      value={values[k]} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
  );

  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        {FIELDS.slice(0, 3).map(field)}
        <TextField label="Date" type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <p className="muted" aria-live="polite">
        BMI: <strong className="tabular">{bmi ?? '—'}</strong>
        {cat.label && <span className={`pill ${cat.tone} plain`} style={{ marginLeft: 8 }}>{cat.label}</span>}
        {!bmi && <span className="subtle"> · Enter weight and height to calculate</span>}
      </p>
      {more ? (
        <>
          <div className="form-grid">{FIELDS.slice(3).map(field)}</div>
          <TextareaField label="Notes" optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </>
      ) : (
        <div><Button variant="ghost" size="sm" icon={Plus} onClick={() => setMore(true)}>More measurements (waist, chest, arms…)</Button></div>
      )}
      <div className="form-actions"><Button type="submit" variant="primary" loading={saving} disabled={!hasAny}>Save measurements</Button></div>
    </form>
  );
}

const METRICS = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm' },
] as const;

export function StatsChart({ stats }: { stats: Stat[] }) {
  const available = METRICS.filter((m) => stats.filter((s) => s[m.key] != null).length >= 1);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>(available[0]?.key ?? 'weight_kg');
  const m = METRICS.find((x) => x.key === metric)!;
  const points = useMemo(
    () => stats.filter((s) => s[metric] != null).map((s) => ({ label: fmtDate(s.recorded_on, { month: 'short', day: 'numeric' }), tip: fmtDate(s.recorded_on), value: s[metric] as number })),
    [stats, metric],
  );
  if (!available.length) return <Empty icon={Scale} title="No measurements yet">Log a first entry to see a chart here.</Empty>;
  const first = points[0]?.value;
  const last = points.at(-1)?.value;
  const change = first != null && last != null && points.length > 1 ? Math.round((last - first) * 10) / 10 : null;
  return (
    <div className="stack">
      <div className="row-between">
        <Segmented label="Measurement" value={metric} onChange={setMetric} options={available.map((x) => ({ value: x.key, label: x.label }))} />
        {change !== null && (
          <span className="muted tabular">
            {change === 0 ? 'No change' : `${change > 0 ? '+' : ''}${change}${m.unit ? ` ${m.unit}` : ''}`} since {points[0].tip}
          </span>
        )}
      </div>
      {points.length > 1 ? (
        <LineChart points={points} format={(v) => `${Math.round(v * 10) / 10}`} ariaLabel={`${m.label} over time`} />
      ) : (
        <p className="muted">One entry so far ({last}{m.unit}). Log another to see a trend.</p>
      )}
    </div>
  );
}

export function StatsTable({ stats, canDelete, onDelete }: { stats: Stat[]; canDelete?: (s: Stat) => boolean; onDelete?: (s: Stat) => void }) {
  const rows = [...stats].reverse();
  if (!rows.length) return null;
  return (
    <div className="table-wrap">
      <table className="table responsive">
        <thead>
          <tr><th>Date</th><th>Weight</th><th>BMI</th><th>Body fat</th><th>Waist</th><th>Logged by</th>{onDelete && <th><span className="sr-only">Actions</span></th>}</tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td data-primary data-label="Date"><strong>{fmtDate(s.recorded_on)}</strong>{s.notes && <div className="subtle">{s.notes}</div>}</td>
              <td data-label="Weight">{s.weight_kg ? `${s.weight_kg} kg` : '—'}</td>
              <td data-label="BMI">{s.bmi ?? '—'}</td>
              <td data-label="Body fat">{s.body_fat_pct ? `${s.body_fat_pct}%` : '—'}</td>
              <td data-label="Waist" className="hide-sm">{s.waist_cm ? `${s.waist_cm} cm` : '—'}</td>
              <td data-label="By" className="hide-sm">{s.recorded_by_role === 'member' ? 'Self' : s.recorded_by_name ?? '—'}</td>
              {onDelete && (
                <td className="right">
                  {canDelete?.(s) && <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete entry from ${fmtDate(s.recorded_on)}`} onClick={() => onDelete(s)} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsPanels({ stats, endpoint, invalidate, canDelete, onDelete }: {
  stats: Stat[]; endpoint: string; invalidate: string[]; canDelete?: (s: Stat) => boolean; onDelete?: (s: Stat) => void;
}) {
  const lastHeight = [...stats].reverse().find((s) => s.height_cm)?.height_cm;
  return (
    <div className="grid grid-main">
      <div className="stack">
        <Panel title="Trend"><StatsChart stats={stats} /></Panel>
        <Panel title="All entries" bodyClass={null}>
          {stats.length ? <StatsTable stats={stats} canDelete={canDelete} onDelete={onDelete} /> : <Empty icon={Scale} title="No entries yet" />}
        </Panel>
      </div>
      <Panel title="Log measurements" description="Weigh in at the same time of day for consistent results.">
        <StatsForm endpoint={endpoint} lastHeight={lastHeight} invalidate={invalidate} />
      </Panel>
    </div>
  );
}
