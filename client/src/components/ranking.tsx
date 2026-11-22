import { Crown, Flame, Plus, Trash2, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { fmtDate, localDate } from '../lib/format';
import { useAction } from '../lib/hooks';
import type { League, LiftKey, LiftLog, LiftScore, Strength, Streak } from '../lib/types';
import { Button, Empty, Pill, SelectField, TextField } from './ui';

export const LIFT_NAMES: Record<LiftKey, string> = {
  squat: 'Back squat', bench: 'Bench press', deadlift: 'Deadlift', ohp: 'Overhead press', pullup: 'Pull-up',
};
export const LEAGUE_ORDER = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite'];

/** League crest: a shield in the league's color with the division numeral. */
export function LeagueBadge({ league, size = 48 }: { league: League | null; size?: number }) {
  const key = league?.key ?? 'none';
  return (
    <svg className={`league-badge lg-${key}`} width={size} height={size * 1.125} viewBox="0 0 64 72" role="img"
      aria-label={league ? `${league.name}${league.division ? ` ${league.division}` : ''} league` : 'Unranked'}>
      <path className="lb-outer" d="M32 2 L60 14 V42 C60 56 47 65 32 70 C17 65 4 56 4 42 V14 Z" />
      <path className="lb-inner" d="M32 9 L53 18.5 V41 C53 52 43.5 59 32 63 C20.5 59 11 52 11 41 V18.5 Z" />
      {league?.key === 'elite' ? (
        <Crown x={18} y={22} width={28} height={28} strokeWidth={2.4} className="lb-mark" />
      ) : (
        <text className="lb-text" x="32" y="45" textAnchor="middle">{league ? league.division : '?'}</text>
      )}
    </svg>
  );
}

export function LeagueName({ league }: { league: League | null }) {
  if (!league) return <span className="muted">Unranked</span>;
  return <span className={`league-name lg-${league.key}`}>{league.name}{league.division ? ` ${league.division}` : ''}</span>;
}

/** The league hero: crest, name, score, and progress to the next league. */
export function LeagueHero({ strength, compact }: { strength: Strength; compact?: boolean }) {
  const { league, score } = strength;
  if (!league) {
    return (
      <div className="league-hero">
        <LeagueBadge league={null} size={compact ? 56 : 80} />
        <div className="stack-sm">
          <div className="league-title">Unranked</div>
          <p className="muted">
            {strength.bodyweight ? 'Log one of the five key lifts to get placed in a league.' : 'Log your bodyweight on Progress, then log a lift to get placed in a league.'}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="league-hero">
      <LeagueBadge league={league} size={compact ? 56 : 88} />
      <div className="stack-sm" style={{ flex: 1, minWidth: 0 }}>
        <div className="league-title"><LeagueName league={league} /></div>
        <div className="row" style={{ gap: 'var(--s2)' }}>
          <span className="score-num">{score}</span>
          <span className="subtle">strength score · {strength.lifts_logged} of 5 lifts</span>
        </div>
        {league.next ? (
          <>
            <div className="league-track" aria-label={`${league.progress}% of the way to ${league.next.name}`}>
              <span className={`lg-fill lg-${league.key}`} style={{ width: `${league.progress}%` }} />
            </div>
            <span className="subtle">{league.next.needed} points to <strong>{league.next.name}</strong></span>
          </>
        ) : <span className="subtle">Top league. Defend it.</span>}
      </div>
    </div>
  );
}

/** The leagues ladder, highlighting the current one. */
export function LeagueLadder({ current }: { current: League | null }) {
  return (
    <ol className="ladder" aria-label="Leagues">
      {LEAGUE_ORDER.map((name, i) => {
        const key = name.toLowerCase() as League['key'];
        const state = !current ? '' : i < current.tier ? 'done' : i === current.tier ? 'here' : '';
        return (
          <li key={name} className={state}>
            <LeagueBadge league={{ key, name, tier: i, division: key === 'elite' ? null : 'I', progress: 0, next: null }} size={26} />
            <span>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function StrengthBreakdown({ lifts }: { lifts: LiftScore[] }) {
  return (
    <ul className="list">
      {lifts.map((l) => (
        <li key={l.key} className="lift-row">
          <div className="grow">
            <div className="row-between" style={{ gap: 'var(--s2)' }}>
              <strong>{l.name}</strong>
              {l.score !== null ? <span className="lift-score">{l.score}</span> : <span className="subtle">Not logged</span>}
            </div>
            <div className="lift-bar"><span style={{ width: `${l.score ?? 0}%` }} /></div>
            <div className="subtle">
              {l.best ? (
                <>
                  {l.level} · best {l.key === 'pullup' ? `${l.best.reps} reps${l.best.weight_kg ? ` +${l.best.weight_kg} kg` : ''}` : `${l.best.weight_kg} kg × ${l.best.reps} (≈${l.best.e1rm} kg max)`}
                  {l.next_level && <> · <strong>{l.next_level.name}</strong> at {l.key === 'pullup' ? `${l.next_level.target} reps` : `${l.next_level.target} kg max`}</>}
                </>
              ) : 'Log a set to score this lift.'}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Log a set of one of the five key lifts. */
export function LiftForm({ endpoint, invalidate, onLogged }: { endpoint: string; invalidate: string[]; onLogged?: (pr: boolean) => void }) {
  const [exercise, setExercise] = useState<LiftKey>('squat');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('5');
  const [date, setDate] = useState(localDate());
  const isPull = exercise === 'pullup';
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  const e1rm = !isPull && w && r ? Math.round((r === 1 ? w : w * (1 + r / 30)) * 10) / 10 : null;
  const [save, saving] = useAction(
    () => api<{ is_pr: boolean }>(endpoint, { method: 'POST', queue: `Lift: ${LIFT_NAMES[exercise]}`, body: { exercise, weight_kg: w, reps: r, performed_on: date } }),
    {
      success: (res) => (res.is_pr ? 'New personal record! +25 points' : 'Lift logged'),
      invalidate,
      onSuccess: (res) => { setWeight(''); onLogged?.(!!res?.is_pr); },
    },
  );
  const submit = (e: FormEvent) => { e.preventDefault(); void save(); };
  return (
    <form className="stack" onSubmit={submit}>
      <SelectField label="Lift" value={exercise} onChange={(e) => setExercise(e.target.value as LiftKey)}>
        {Object.entries(LIFT_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </SelectField>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <TextField label={isPull ? 'Added weight' : 'Weight'} unit="kg" type="number" inputMode="decimal" step="0.5" min="0"
          value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={isPull ? '0' : ''} />
        <TextField label="Reps" type="number" inputMode="numeric" min="1" max="50" value={reps} onChange={(e) => setReps(e.target.value)} />
      </div>
      <TextField label="Date" type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
      <p className="subtle" aria-live="polite">
        {isPull ? 'Strict, full range reps. Add a belt weight if you used one.' : e1rm ? <>Estimated one-rep max: <strong>{e1rm} kg</strong></> : 'Log your best working set. Clean reps only.'}
      </p>
      <Button type="submit" variant="primary" icon={Plus} loading={saving} disabled={!r || (!isPull && !w)}>Log lift</Button>
    </form>
  );
}

export function LiftList({ lifts, canDelete, onDelete }: { lifts: LiftLog[]; canDelete?: (l: LiftLog) => boolean; onDelete?: (l: LiftLog) => void }) {
  const [all, setAll] = useState(false);
  if (!lifts.length) return <Empty icon={Trophy} title="No lifts yet">Log a squat, bench, deadlift, overhead press, or pull-ups to get ranked.</Empty>;
  const shown = all ? lifts : lifts.slice(0, 6);
  return (
    <>
    <ul className="list">
      {shown.map((l) => (
        <li key={l.id}>
          <div className="grow">
            <strong>{LIFT_NAMES[l.exercise]}</strong> {l.is_pr ? <Pill tone="primary" plain>PR</Pill> : null}
            <div className="subtle">
              {l.exercise === 'pullup' ? `${l.reps} reps${l.weight_kg ? ` +${l.weight_kg} kg` : ''}` : `${l.weight_kg} kg × ${l.reps}`} · {fmtDate(l.performed_on, { month: 'short', day: 'numeric' })}
              {l.recorded_by_role && l.recorded_by_role !== 'member' && l.recorded_by_name ? ` · by ${l.recorded_by_name}` : ''}
            </div>
          </div>
          {onDelete && canDelete?.(l) && <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete lift" onClick={() => onDelete(l)} />}
        </li>
      ))}
    </ul>
    {lifts.length > 6 && (
      <div className="panel-foot"><Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${lifts.length} lifts`}</Button></div>
    )}
    </>
  );
}

const DAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Weekly streak: a week counts when there's at least one visit. */
export function StreakWidget({ streak, compact }: { streak: Streak; compact?: boolean }) {
  return (
    <div className={`streak${streak.current ? ' lit' : ''}`}>
      <div className="streak-head">
        <span className="streak-flame"><Flame size={compact ? 22 : 28} strokeWidth={2.4} aria-hidden /></span>
        <div>
          <div className="streak-num">{streak.current}<span> week{streak.current === 1 ? '' : 's'}</span></div>
          <div className="subtle">
            {streak.current === 0 ? 'Visit this week to start a streak'
              : streak.at_risk ? 'Visit this week to keep it alive'
              : `Best: ${streak.best} week${streak.best === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>
      <ol className="week-dots" aria-label="This week">
        {streak.week.map((d, i) => (
          <li key={d.date} className={[d.visited && 'on', d.today && 'today', d.future && 'future'].filter(Boolean).join(' ')}
            aria-label={`${fmtDate(d.date, { weekday: 'long' })}: ${d.visited ? 'visited' : d.future ? 'upcoming' : 'no visit'}`}>
            <span>{DAY[i]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RankChip({ label, rank, of }: { label: string; rank: number | null | undefined; of?: number }) {
  return (
    <div className="rank-chip">
      <span className="rank-num">{rank ? `#${rank}` : '—'}</span>
      <span className="subtle">{label}{rank && of ? ` of ${of}` : ''}</span>
    </div>
  );
}
