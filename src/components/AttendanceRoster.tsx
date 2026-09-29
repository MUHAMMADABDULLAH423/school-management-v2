import React, { useMemo, useState } from 'react';
import { UserCheck, UserX, Clock } from 'lucide-react';
import {
  AttendanceRecord, Student, DateFilterState, AttendanceStatus, dateInFilter,
} from '../types';
import { Card, CardHeader, Badge, EmptyState, Table, Avatar, SearchInput, Select } from './ui';

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

export const AttendanceRoster: React.FC<{
  records: AttendanceRecord[];
  students: Student[];
  filter: DateFilterState;
  filterLabel: string;
}> = ({ records, students, filter, filterLabel }) => {
  const [status, setStatus] = useState<StatusFilter>('All');
  const [cls, setCls] = useState('All');
  const [q, setQ] = useState('');

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

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return period.filter((r) => {
      if (status !== 'All' && r.status !== status) return false;
      if (cls !== 'All' && r.classSection !== cls) return false;
      if (needle) {
        const s = r.studentId ? studentMap.get(r.studentId) : undefined;
        const hay = `${s?.name || ''} ${s?.rollNumber || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [period, status, cls, q, studentMap]);

  return (
    <Card>
      <CardHeader
        title="Attendance Roster"
        subtitle="Student attendance for the selected period"
        pill={filterLabel}
      />
      <div className="px-5 py-4">
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
      </div>
    </Card>
  );
};
