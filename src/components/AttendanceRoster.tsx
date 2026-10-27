import React, { useMemo, useState } from 'react';
import { UserCheck, UserX, Clock } from 'lucide-react';
import {
  AttendanceRecord, Student, DateFilterState, AttendanceStatus, dateInFilter,
} from '../types';
import { Card, CardHeader, Badge, EmptyState, Table, Avatar, SearchInput, Select } from './ui';
import { DonutChart } from './DonutChart';

const statusTone: Record<AttendanceStatus, 'green' | 'red' | 'amber' | 'blue' | 'slate'> = {
  Present: 'green',
  Absent: 'red',
  Late: 'amber',
  HalfDay: 'blue',
  Leave: 'slate',
};

type StatusFilter = 'All' | 'Present' | 'Absent' | 'Late';

export type AttendanceSlice = 'present' | 'absent' | 'late' | 'leave';

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

export const AttendanceRoster: React.FC<{
  records: AttendanceRecord[];
  students: Student[];
  filter: DateFilterState;
  filterLabel: string;
  /** Main overview: chart only — clicking a slice navigates to the detail section. */
  chartOnly?: boolean;
  onSliceClick?: (slice: AttendanceSlice) => void;
  /** Detail section: no chart, Back button, slice pre-selected as a list filter. */
  detailMode?: boolean;
  initialSlice?: AttendanceSlice | null;
  onBack?: () => void;
}> = ({ records, students, filter, filterLabel, chartOnly = false, onSliceClick, detailMode = false, initialSlice = null, onBack }) => {
  const [status, setStatus] = useState<StatusFilter>('All');
  const [cls, setCls] = useState('All');
  const [q, setQ] = useState('');
  /** Donut slice selected for drill-down / detail filter; null = all. */
  const [slice, setSlice] = useState<AttendanceSlice | null>(initialSlice);

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

  const leaveCount = useMemo(
    () => period.filter((r) => r.status === 'Leave').length,
    [period]
  );

  /** Records behind the selected donut slice (click a slice to drill down). */
  const sliceRows = useMemo(() => {
    if (!slice) return [];
    if (slice === 'present') {
      return period.filter((r) => r.status === 'Present' || r.status === 'HalfDay');
    }
    const want: AttendanceStatus = slice === 'absent' ? 'Absent' : slice === 'late' ? 'Late' : 'Leave';
    return period.filter((r) => r.status === want);
  }, [period, slice]);

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
    // In the detail section the slice is a list filter (no separate drill-down list).
    if (detailMode && slice) {
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
  }, [period, status, cls, q, studentMap, detailMode, slice]);

  return (
    <>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 hover:text-indigo-900"
        >
          ← Back to overview
        </button>
      )}
      <Card>
        <CardHeader
          title="Attendance Roster"
          subtitle="Student attendance for the selected period"
          pill={filterLabel}
        />
        <div className="px-5 py-4">
          {/* Slice picker in the detail section (no chart there to click) */}
          {detailMode && (
            <div className="flex flex-wrap gap-2 mb-4">
              {([
                { key: null, label: 'All records' },
                { key: 'present', label: 'Present' },
                { key: 'absent', label: 'Absent' },
                { key: 'late', label: 'Late' },
                { key: 'leave', label: 'Leave' },
              ] as const).map((opt) => (
                <button
                  key={String(opt.key)}
                  type="button"
                  onClick={() => setSlice(opt.key)}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    slice === opt.key
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Donut chart: hidden in the detail section (the slice picker replaces it) */}
          {!detailMode && (
          <div className="rounded-2xl border border-slate-200 px-5 py-4 mb-4">
            <DonutChart
              segments={[
                { key: 'present', label: 'Present', value: counts.present, color: '#10b981' },
                { key: 'absent', label: 'Absent', value: counts.absent, color: '#f43f5e' },
                { key: 'late', label: 'Late', value: counts.late, color: '#f59e0b' },
                { key: 'leave', label: 'Leave', value: leaveCount, color: '#64748b' },
              ]}
              centerLabel="records"
              centerValue={String(counts.total)}
              selectedKey={chartOnly ? null : slice}
              onSelect={(k) => {
                if (chartOnly) {
                  if (k) onSliceClick?.(k as AttendanceSlice);
                } else {
                  setSlice(k as AttendanceSlice | null);
                }
              }}
              hint={chartOnly ? 'Click a slice to open its detail.' : undefined}
            />
          </div>
          )}

          {/* Inline drill-down: full view only (the detail section filters the main list instead) */}
          {!chartOnly && !detailMode && slice && (
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

        {/* Summary chips: full + detail views only — the chart-only overview shows just the chart */}
        {!chartOnly && (
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

        {/* Filters + full list: in the detail section the slice filters the list;
            in the full view the list hides while the drill-down is open. */}
        {(detailMode || !slice) && (
          <>
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
    </>
  );
};
