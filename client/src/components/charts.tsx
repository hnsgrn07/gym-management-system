import { useEffect, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

interface Point { label: string; value: number; tip?: string }

/** Single-series line chart for a measurement over time. */
export function LineChart({ points, color = 'var(--chart-1)', height = 220, format = (v) => String(v), ariaLabel }: {
  points: Point[]; color?: string; height?: number; format?: (v: number) => string; ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { t: 12, r: 16, b: 28, l: 44 };
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const w = Math.max(width - pad.l - pad.r, 10);
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => pad.t + h - ((v - yMin) / (yMax - yMin || 1)) * h;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${pad.t + h} L${x(0)},${pad.t + h} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 72))));

  return (
    <div ref={ref} className="chart-box" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            const px = e.clientX - rect.left;
            let best = 0;
            points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
            setHover(best);
          }}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}>{p.label}</text>
          ))}
          <path className="area" d={area} fill={color} />
          <path className="series" d={path} stroke={color} />
          {hover !== null && <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} />}
          {points.map((p, i) => (
            <circle key={i} className="dot" cx={x(i)} cy={y(p.value)} r={hover === i ? 5.5 : points.length > 24 ? 0 : 3.5} fill={color} />
          ))}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <div className="chart-tip" style={{ left: x(hover), top: y(points[hover].value) }}>
          <strong>{format(points[hover].value)}</strong> · {points[hover].tip ?? points[hover].label}
        </div>
      )}
    </div>
  );
}

interface Series { name: string; color: string }
interface BarDatum { label: string; tip?: string; values: number[] }

/** Stacked bar chart (e.g. revenue by type per day, visits per hour). */
export function BarChart({ data, series, height = 220, format = (v) => String(v), ariaLabel, legend = true }: {
  data: BarDatum[]; series: Series[]; height?: number; format?: (v: number) => string; ariaLabel: string; legend?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { t: 12, r: 8, b: 28, l: 48 };
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(0, Math.max(1, ...totals));
  const yMax = ticks[ticks.length - 1];
  const w = Math.max(width - pad.l - pad.r, 10);
  const h = height - pad.t - pad.b;
  const slot = w / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(36, slot * 0.66));
  const y = (v: number) => pad.t + h - (v / yMax) * h;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 56))));

  let tipContent: ReactNode = null;
  if (hover !== null && data[hover]) {
    const d = data[hover];
    tipContent = (
      <>
        <strong>{d.tip ?? d.label}</strong>
        {series.map((s, i) => d.values[i] > 0 && <div key={s.name}>{s.name}: {format(d.values[i])}</div>)}
        {series.length > 1 && <div>Total: {format(totals[hover])}</div>}
      </>
    );
  }

  return (
    <div className="stack-sm">
      {legend && series.length > 1 && (
        <div className="legend">
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
      <div ref={ref} className="chart-box" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{format(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              let acc = 0;
              const cx = pad.l + slot * i + slot / 2;
              return (
                <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                  <rect x={pad.l + slot * i} y={pad.t} width={slot} height={h} fill="transparent" />
                  {d.values.map((v, si) => {
                    if (!v) return null;
                    const top = y(acc + v);
                    const bh = y(acc) - top;
                    acc += v;
                    return <rect key={si} x={cx - bw / 2} y={top} width={bw} height={Math.max(bh - 1, 1)} rx={Math.min(3, bw / 4)} fill={series[si].color} opacity={hover === null || hover === i ? 1 : 0.45} />;
                  })}
                  {(i % labelEvery === 0) && <text x={cx} y={height - 8} textAnchor="middle">{d.label}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && tipContent && (
          <div className="chart-tip" style={{ left: pad.l + slot * hover + slot / 2, top: y(totals[hover]) }}>{tipContent}</div>
        )}
      </div>
    </div>
  );
}
