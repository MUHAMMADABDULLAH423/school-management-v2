import React, { useMemo, useState } from 'react';
import { UserCheck, UserX, Clock } from 'lucide-react';
import {
  AttendanceRecord, Student, DateFilterState, AttendanceStatus, dateInFilter, filterDateList,
} from '../types';
import { Card, CardHeader, Badge, EmptyState, Table, Avatar, SearchInput, Select } from './ui';
import { LineChart } from './LineChart';

const statusTone: Record<AttendanceStatus, 'green' | 'red' | 'amber' | 'blue' | 'slate'> = {
  Present: 'green',
  Absent: 'red',
  Late: 'amber',
  HalfDay: 'blue',
  Leave: 'slate',
};

type StatusFilter = 'All' | 'Present' | 'Absent' | 'Late';

const CountChip: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}> = ({ label, value, icon, tone }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${tone}`}>
    {icon}
    <span className="text-sm font-bold">{value}</span>
    <span className="text-xs font-semibold">{label}</span>
  </div>
);

export type AttendanceSlice = 'present' | 'absent' | 'late' | 'leave';

/** 'chart' = main overview (chart only) · 'window' = detail window (chart + list only) · 'full' = everything. */
export type AttendanceRosterMode = 'full' | 'chart' | 'window';

export const AttendanceRoster: React.FC<{
  records: AttendanceRecord[];
  students: Student[];
  filter: DateFilterState;
  filterLabel: string;
  mode?: AttendanceRosterMode;
  /** 'chart' mode: clicking a slice opens the detail window. */
  onSliceClick?: (slice: AttendanceSlice) => void;
  /** 'window' mode: slice is controlled by the parent (null closes the window). */
  windowSlice?: AttendanceSlice | null;
  onWindowSliceChange?: (slice: AttendanceSlice | null) => void;
}> = ({ records, students, filter, filterLabel, mode = 'full', onSliceClick, windowSlice, onWindowSliceChange }) => {
  const [status, setStatus] = useState<StatusFilter>('All');
  const [cls, setCls] = useState('All');
  const [q, setQ] = useState('');
  const [innerSlice, setInnerSlice] = useState<AttendanceSlice | null>(null);
  /** Donut slice selected for drill-down; null = chart only. */
  const slice = mode === 'window' ? windowSlice ?? null : innerSlice;
  const setSlice = (s: AttendanceSlice | null) => {
    if (mode === 'window') onWindowSliceChange?.(s);
    else setInnerSlice(s);
  };

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const period = useMemo(
    () => records.filter((r) => r.type === 'student' && dateInFilter(r.date, filter)),
    [records, filter]
  );

  const counts = useMemo(() => {
    const present = period.filter((r) => r.status === 'Present' || r.status === 'HalfDay').length;
    const absent = period.filter((r) => r.status === 'Absent').length;
    const late = period.filter((r) => r.status === 'Late').length;
    const total = period.length;
    return {
      present,
      absent,
      late,
      total,
      rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
    };
  }, [period]);

  const classSections = useMemo(() => {
    const set = new Set<string>();
    for (const r of period) if (r.classSection) set.add(r.classSection);
    return [...set].sort();
  }, [period]);

  /** Records behind the selected line (click a line to drill down). */
  const sliceRows = useMemo(() => {
    if (!slice) return [];
    if (slice === 'present') {
      return period.filter((r) => r.status === 'Present' || r.status === 'HalfDay');
    }
    const want: AttendanceStatus = slice === 'absent' ? 'Absent' : slice === 'late' ? 'Late' : 'Leave';
    return period.filter((r) => r.status === want);
  }, [period, slice]);

  /** Dates covered by the filter, and status counts per day (line chart). */
  const chartDates = useMemo(() => filterDateList(filter), [filter]);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateLabel = (d: string) => {
    const [, m, day] = d.split('-');
    return `${parseInt(day, 10)} ${monthNames[parseInt(m, 10) - 1] || ''}`;
  };
  const lineSeries = useMemo(() => {
    const countOn = (d: string, pred: (r: AttendanceRecord) => boolean) =>
      period.filter((r) => r.date === d && pred(r)).length;
    return [
      { key: 'present', label: 'Present', values: chartDates.map((d) => countOn(d, (r) => r.status === 'Present' || r.status === 'HalfDay')), color: '#10b981' },
      { key: 'absent', label: 'Absent', values: chartDates.map((d) => countOn(d, (r) => r.status === 'Absent')), color: '#f43f5e' },
      { key: 'late', label: 'Late', values: chartDates.map((d) => countOn(d, (r) => r.status === 'Late')), color: '#f59e0b' },
      { key: 'leave', label: 'Leave', values: chartDates.map((d) => countOn(d, (r) => r.status === 'Leave')), color: '#64748b' },
    ];
  }, [period, chartDates]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = period.filter((r) => {
      if (status !== 'All' && r.status !== status) return false;
      if (cls !== 'All' && r.classSection !== cls) return false;
      if (needle) {
        const s = r.studentId ? studentMap.get(r.studentId) : undefined;
        const hay = `${s?.name || ''} ${s?.rollNumber || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // In the detail window the slice filters the list (no status/class/search there).
    if (mode === 'window' && slice) {
      list = list.filter((r) =>
        slice === 'present'
          ? r.status === 'Present' || r.status === 'HalfDay'
          : slice === 'absent'
          ? r.status === 'Absent'
          : slice === 'late'
          ? r.status === 'Late'
          : r.status === 'Leave'
      );
    }
    return list;
  }, [period, status, cls, q, studentMap, mode, slice]);

  return (
    <Card>
      <CardHeader
        title="Attendance Roster"
        subtitle="Student attendance for the selected period"
        pill={filterLabel}
      />
      <div className="px-5 py-4">
        {/* Line chart: every mode. Chart mode navigates to the window; window mode
            toggles (re-click closes); full mode drills down inline. */}
        <div className={`rounded-2xl border border-slate-200 px-5 py-4 ${mode === 'chart' ? '' : 'mb-4'}`}>
          <LineChart
            series={lineSeries}
            xLabels={chartDates.map(dateLabel)}
            selectedKey={mode === 'chart' ? null : slice}
            onSelect={(k) => {
              if (mode === 'chart') {
                if (k) onSliceClick?.(k as AttendanceSlice);
              } else {
                setSlice(k as AttendanceSlice | null);
              }
            }}
            hint={
              mode === 'chart'
                ? 'Click a line to open its detail.'
                : mode === 'window'
                ? 'Click a line to switch — click the selected line again to go back.'
                : undefined
            }
          />
          {mode === 'full' && slice && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold text-slate-800 capitalize">
                  {slice} — {sliceRows.length} record(s)
                </div>
                <button
                  type="button"
                  onClick={() => setSlice(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  Close ✕
                </button>
              </div>
              {sliceRows.length === 0 ? (
                <EmptyState title="No records" hint="Nothing in this slice for the selected period." />
              ) : (
                <div className="max-h-72 overflow-y-auto nice-scroll">
                  <Table head={['Student', 'Class', 'Date', 'Status']}>
                    {sliceRows.map((r) => {
                      const s = r.studentId ? studentMap.get(r.studentId) : undefined;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Avatar src={s?.photo} name={s?.name || 'Unknown'} size={32} />
                              <div>
                                <div className="font-semibold text-slate-800">{s?.name || 'Unknown'}</div>
                                <div className="text-[11px] text-slate-400">{s?.rollNumber || ''}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.classSection || '—'}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.date}</td>
                          <td className="px-3 py-2">
                            <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary chips: full view only — the chart/window modes show just the chart (+ list) */}
        {mode === 'full' && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <CountChip
            label="Present"
            value={counts.present}
            icon={<UserCheck className="w-4 h-4" />}
            tone="bg-emerald-50 border-emerald-200 text-emerald-700"
          />
          <CountChip
            label="Absent"
            value={counts.absent}
            icon={<UserX className="w-4 h-4" />}
            tone="bg-rose-50 border-rose-200 text-rose-700"
          />
          <CountChip
            label="Late"
            value={counts.late}
            icon={<Clock className="w-4 h-4" />}
            tone="bg-amber-50 border-amber-200 text-amber-700"
          />
          <span className="ml-auto text-sm font-bold text-slate-700">
            Attendance rate:{' '}
            <span className={counts.rate >= 90 ? 'text-emerald-600' : counts.rate >= 75 ? 'text-amber-600' : 'text-rose-600'}>
              {counts.rate}%
            </span>
          </span>
        </div>
        )}

        {/* Full view: filters + list hide while the inline drill-down is open.
            Window mode: the slice filters this same list (no filters).
            Chart mode: never show the list — it appears only in the window. */}
        {(mode === 'window' || (mode === 'full' && !slice)) && (
          <>
            {mode === 'full' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <SearchInput value={q} onChange={setQ} placeholder="Search name or roll no…" />
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="All">Status: All</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Late">Late</option>
              </Select>
              <Select value={cls} onChange={(e) => setCls(e.target.value)}>
                <option value="All">Class: All</option>
                {classSections.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            )}

            {rows.length === 0 ? (
              <EmptyState
                title="No attendance records"
                hint="No records match the selected period and filters."
              />
            ) : (
              <Table head={['Student', 'Class', 'Date', 'Status', 'Marked by']}>
            {rows.map((r) => {
              const s = r.studentId ? studentMap.get(r.studentId) : undefined;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar src={s?.photo} name={s?.name || 'Unknown'} size={32} />
                      <div>
                        <div className="font-semibold text-slate-800">{s?.name || 'Unknown'}</div>
                        <div className="text-[11px] text-slate-400">{s?.rollNumber || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {r.classSection || '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2">
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.markedBy || '—'}</td>
                </tr>
              );
            })}
              </Table>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
