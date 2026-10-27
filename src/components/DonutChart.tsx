import React from 'react';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string; // hex, e.g. '#10b981'
}

const SIZE = 180;
const STROKE = 26;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * Clickable SVG donut chart. Clicking a segment (or its legend row) selects
 * it; clicking again clears the selection. The parent renders the drill-down
 * detail for the selected segment key.
 */
export const DonutChart: React.FC<{
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  formatValue?: (v: number) => string;
  hint?: string;
}> = ({ segments, centerLabel, centerValue, selectedKey = null, onSelect, formatValue, hint }) => {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const fmt = formatValue || ((v: number) => String(v));

  let acc = 0;
  const arcs = segments.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const len = Math.max(0, frac * CIRC - (segments.length > 1 && frac > 0 ? 3 : 0));
    const offset = -(acc * CIRC);
    acc += frac;
    return { ...s, len, offset, frac };
  });

  const toggle = (key: string) => onSelect?.(selectedKey === key ? null : key);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a) =>
              a.len > 0 ? (
                <circle
                  key={a.key}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={selectedKey === a.key ? STROKE + 6 : STROKE}
                  strokeDasharray={`${a.len} ${CIRC - a.len}`}
                  strokeDashoffset={a.offset}
                  onClick={() => toggle(a.key)}
                  className="cursor-pointer transition-all"
                  opacity={selectedKey && selectedKey !== a.key ? 0.35 : 1}
                >
                  <title>{`${a.label}: ${fmt(a.value)}`}</title>
                </circle>
              ) : null
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-8 text-center">
          <div className="text-xl font-extrabold text-slate-900 leading-tight break-words w-full">{centerValue}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{centerLabel}</div>
        </div>
      </div>

      <div className="w-full min-w-0 space-y-1">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
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
              <span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(s.value)}</span>
              <span className="text-xs font-semibold text-slate-500 tabular-nums w-10 text-right">{pct}%</span>
            </button>
          );
        })}
        {total === 0 && (
          <p className="text-xs text-slate-400 px-3">No data for the selected period.</p>
        )}
        <p className="text-[11px] text-slate-400 px-3 pt-1">{hint || 'Click a slice or row to see its detail below.'}</p>
      </div>
    </div>
  );
};
