import React from 'react';
import { CalendarDays, CalendarRange, RotateCcw } from 'lucide-react';
import { DateFilterState, DateFilterMode, defaultDateFilter } from '../types';
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
];

export const DateFilter: React.FC<{
  filter: DateFilterState;
  onChange: (f: DateFilterState) => void;
  /** Tighter vertical layout for narrow side columns. */
  compact?: boolean;
}> = ({ filter, onChange, compact = false }) => {
  const set = (patch: Partial<DateFilterState>) => onChange({ ...filter, ...patch });

  const handleStart = (v: string) =>
    set({ startDate: v, endDate: v > filter.endDate ? v : filter.endDate });
  const handleEnd = (v: string) =>
    set({ endDate: v, startDate: v < filter.startDate ? v : filter.startDate });

  return (
    <Card>
      <CardHeader
        title="Date Filter"
        subtitle={compact ? undefined : 'Every section below reacts to this filter'}
        action={
          <GhostButton onClick={() => onChange(defaultDateFilter())}>
            <RotateCcw className="w-4 h-4" />
            Reset to today
          </GhostButton>
        }
      />
      <div className={compact ? 'px-3 py-2.5 space-y-2.5' : 'px-5 py-4 space-y-4'}>
        <div className="flex flex-wrap gap-2">
          {modes.map((m) => {
            const active = filter.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => set({ mode: m.id })}
                className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${
                  compact ? 'px-2 py-1 text-[11px]' : 'px-3.5 py-2 text-sm'
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
      </div>
    </Card>
  );
};
