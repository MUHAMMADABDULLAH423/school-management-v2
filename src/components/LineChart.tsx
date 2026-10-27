import React from 'react';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  color: string; // hex, e.g. '#10b981'
}

const W = 560;
const H = 240;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 28;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/**
 * Clickable SVG line chart. Clicking a line, a point, or a legend row selects
 * that series; clicking the selected series again clears the selection.
 * The parent decides what a selection means (e.g. opening the detail window).
 */
export const LineChart: React.FC<{
  series: LineSeries[];
  xLabels: string[];
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  formatValue?: (v: number) => string;
  /** Axis tick labels (defaults to plain numbers). */
  yFormat?: (v: number) => string;
  hint?: string;
}> = ({ series, xLabels, selectedKey = null, onSelect, formatValue, yFormat, hint }) => {
  const n = xLabels.length;
  const totals = series.map((s) => s.values.reduce((a, v) => a + v, 0));
  const grand = totals.reduce((a, v) => a + v, 0);
  const fmt = formatValue || ((v: number) => String(v));
  const fmtAxis = yFormat || ((v: number) => String(v));
  const yMax = Math.max(1, ...series.flatMap((s) => s.values));

  const x = (i: number) => PAD_L + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => PAD_T + PLOT_H - (v / yMax) * PLOT_H;

  const toggle = (key: string) => onSelect?.(selectedKey === key ? null : key);

  // X labels: at most ~8, always including the last one.
  const step = Math.max(1, Math.ceil(n / 8));
  const labelIdx = new Set<number>();
  for (let i = 0; i < n; i += step) labelIdx.add(i);
  if (n > 0) labelIdx.add(n - 1);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" className="block">
        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(yMax * t)} y2={y(yMax * t)} stroke="#f1f5f9" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(yMax * t) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">
              {fmtAxis(Math.round(yMax * t))}
            </text>
          </g>
        ))}
        {/* x labels */}
        {xLabels.map((lb, i) =>
          labelIdx.has(i) ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {lb}
            </text>
          ) : null
        )}
        {/* series lines + points */}
        {series.map((s) => {
          const dimmed = selectedKey != null && selectedKey !== s.key;
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.key} opacity={dimmed ? 0.2 : 1} className="transition-opacity">
              {s.values.length > 1 && (
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={selectedKey === s.key ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {/* wide invisible hit area */}
              {s.values.length > 1 && (
                <polyline
                  points={pts}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  onClick={() => toggle(s.key)}
                  className="cursor-pointer"
                >
                  <title>{`${s.label}: ${fmt(totals[series.indexOf(s)])}`}</title>
                </polyline>
              )}
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={selectedKey === s.key ? 4.5 : 3.5}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                  onClick={() => toggle(s.key)}
                  className="cursor-pointer"
                >
                  <title>{`${s.label} · ${xLabels[i]}: ${fmt(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="w-full min-w-0 space-y-1 mt-2">
        {series.map((s, idx) => {
          const pct = grand > 0 ? Math.round((totals[idx] / grand) * 100) : 0;
          const active = selectedKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              title="Click to see detail"
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition ${
                active ? 'bg-slate-100 ring-1 ring-slate-300' : 'hover:bg-slate-50'
              }`}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 truncate">{s.label}</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(totals[idx])}</span>
              <span className="text-xs font-semibold text-slate-500 tabular-nums w-10 text-right">{pct}%</span>
            </button>
          );
        })}
        {grand === 0 && (
          <p className="text-xs text-slate-400 px-3">No data for the selected period.</p>
        )}
        <p className="text-[11px] text-slate-400 px-3 pt-1">{hint || 'Click a line or row to see its detail.'}</p>
      </div>
    </div>
  );
};
