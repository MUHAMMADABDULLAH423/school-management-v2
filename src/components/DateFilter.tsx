import React from 'react';
import { Calendar, CalendarDays, CalendarRange, RotateCcw } from 'lucide-react';
import { DateFilterState, DateFilterMode, defaultDateFilter, monthStr } from '../types';
import { Card, CardHeader, GhostButton, inputCls } from './ui';

/** "2026-09" -> "Sep 2026" */
export const monthLabel = (ym: string): string => {
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${names[idx] || ''} ${y}`;
};

/** Last 6 calendar months as YYYY-MM, newest last. */
const lastSixMonths = (): string[] => {
  const out: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    // 15th at noon avoids UTC month-boundary slips in monthStr()
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15, 12);
    out.push(monthStr(d));
  }
  return out;
};

/** Filter label text: single -> date; range -> "start → end"; months -> "N month(s)". */
export const filterLabelFor = (f: DateFilterState): string => {
  if (f.mode === 'single') return f.singleDate;
  if (f.mode === 'range') return `${f.startDate} → ${f.endDate}`;
  const n = f.selectedMonths.length;
  return `${n} month${n === 1 ? '' : 's'}`;
};

const modes: { id: DateFilterMode; label: string; icon: React.ReactNode }[] = [
  { id: 'single', label: 'Single day', icon: <CalendarDays className="w-4 h-4" /> },
  { id: 'range', label: 'Date range', icon: <CalendarRange className="w-4 h-4" /> },
  { id: 'months', label: 'Months', icon: <Calendar className="w-4 h-4" /> },
];

export const DateFilter: React.FC<{
  filter: DateFilterState;
  onChange: (f: DateFilterState) => void;
  /** Tighter vertical layout for narrow side columns. */
  compact?: boolean;
}> = ({ filter, onChange, compact = false }) => {
  const set = (patch: Partial<DateFilterState>) => onChange({ ...filter, ...patch });

  const toggleMonth = (ym: string) => {
    const has = filter.selectedMonths.includes(ym);
    const next = has
      ? filter.selectedMonths.filter((m) => m !== ym)
      : [...filter.selectedMonths, ym];
    if (next.length === 0) return; // keep ≥1 selected
    set({ selectedMonths: next });
  };

  const handleStart = (v: string) =>
    set({ startDate: v, endDate: v > filter.endDate ? v : filter.endDate });
  const handleEnd = (v: string) =>
    set({ endDate: v, startDate: v < filter.startDate ? v : filter.startDate });

  return (
    <Card>
      <CardHeader
        title="Date Filter"
        subtitle="Every section below reacts to this filter"
        action={
          <GhostButton onClick={() => onChange(defaultDateFilter())}>
            <RotateCcw className="w-4 h-4" />
            Reset to today
          </GhostButton>
        }
      />
      <div className={compact ? 'px-4 py-3 space-y-3' : 'px-5 py-4 space-y-4'}>
        <div className="flex flex-wrap gap-2">
          {modes.map((m) => {
            const active = filter.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => set({ mode: m.id })}
                className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${
                  compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
                } ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            );
          })}
        </div>

        {filter.mode === 'single' && (
          <div className={compact ? '' : 'max-w-xs'}>
            <input
              type="date"
              className={inputCls}
              value={filter.singleDate}
              onChange={(e) => set({ singleDate: e.target.value })}
            />
          </div>
        )}

        {filter.mode === 'range' && (
          <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg'}>
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1">From</span>
              <input
                type="date"
                className={inputCls}
                value={filter.startDate}
                onChange={(e) => handleStart(e.target.value)}
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-1">To</span>
              <input
                type="date"
                className={inputCls}
                value={filter.endDate}
                onChange={(e) => handleEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        {filter.mode === 'months' && (
          <div className="flex flex-wrap gap-2">
            {lastSixMonths().map((ym) => {
              const active = filter.selectedMonths.includes(ym);
              return (
                <button
                  key={ym}
                  type="button"
                  onClick={() => toggleMonth(ym)}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-700'
                  }`}
                >
                  {monthLabel(ym)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};
