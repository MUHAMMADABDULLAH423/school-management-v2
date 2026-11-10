import React, { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import {
  AttendanceRecord, AttendanceStatus, ClassSection, StaffMember, Student, isOwnChild, todayStr,
} from '../types';
import {
  Avatar, Card, CardHeader, EmptyState, Field, SearchInput, Select, Spinner,
  Tabs, TextInput,
} from './ui';

/** One-letter register marks. */
const LETTER: Record<AttendanceStatus, string> = {
  Present: 'P', Absent: 'A', Late: 'L', HalfDay: 'H', Leave: 'Lv',
};

const CELL_TONE: Record<AttendanceStatus, string> = {
  Present: 'bg-emerald-100 text-emerald-800',
  Absent: 'bg-rose-100 text-rose-700',
  Late: 'bg-amber-100 text-amber-800',
  HalfDay: 'bg-sky-100 text-sky-800',
  Leave: 'bg-violet-100 text-violet-700',
};

/** ISO date (YYYY-MM-DD) shifted by n days (UTC, matches todayStr()). */
const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Every date from `from` to `to` inclusive, capped at 31 days. */
const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < 31) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
};

/** "2026-11-09" -> "09/11". */
const shortDate = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

/** First day of the month of an ISO date ("2026-11-09" -> "2026-11-01"). */
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

/**
 * Attendance Register (history) — Admin + Principal, and (parentMode) Parents.
 * Rows = students/staff, columns = dates, cells = P/A/L/H/Lv or — (not marked).
 * Both student and staff attendance live in the same `attendance` collection
 * (type 'student' | 'staff', doc id `${date}_${personId}`).
 * Read-only view: marking still happens on the Attendance / Staff Attendance
 * pages; teachers never get this page (no nav item in their portal).
 * Parent mode: only the parent's OWN children, Students tab only, no class
 * filter/search. The register shows AT MOST 1 month (31 days) for everyone —
 * old records are never deleted, only the view is capped.
 */
export const AttendanceRegister: React.FC<{ parentMode?: boolean }> = ({ parentMode = false }) => {
  const { currentUser } = useAuth();
  const { data: records, loading: loadingRecords } = useCollection<AttendanceRecord>('attendance');
  const { data: students, loading: loadingStudents } = useCollection<Student>('students');
  const { data: staff, loading: loadingStaff } = useCollection<StaffMember>('staff');
  const { data: classes } = useCollection<ClassSection>('classes');

  const [mode, setMode] = useState<'student' | 'staff'>('student');
  // Default range = the WHOLE current month (1st of the month → today) for
  // everyone. Either way the range can never exceed 31 days (1 month) — see
  // effTo below (a full month is at most 31 days, so it always fits).
  const [from, setFrom] = useState(firstOfMonth(todayStr()));
  const [to, setTo] = useState(todayStr());
  const [classFilter, setClassFilter] = useState('all');
  const [q, setQ] = useState('');

  // Clamp an over-long range to 31 days (from the start date).
  const rangeClamped = to > addDays(from, 30);
  const effTo = rangeClamped ? addDays(from, 30) : to;
  const dates = useMemo(() => datesBetween(from, effTo), [from, effTo]);

  const classOptions = useMemo(
    () => classes
      .map((c) => `${c.name} - ${c.section}`)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [classes]
  );

  /** status lookup: `${personId}|${date}` -> status (this mode + range only). */
  const byPersonDate = useMemo(() => {
    const map = new Map<string, AttendanceStatus>();
    records.forEach((r) => {
      if (r.type !== mode) return;
      if (r.date < from || r.date > effTo) return;
      const pid = mode === 'student' ? r.studentId : r.staffId;
      if (pid) map.set(`${pid}|${r.date}`, r.status);
    });
    return map;
  }, [records, mode, from, effTo]);

  /** People with a record in this range (so deactivated members' history
   *  still shows) plus every active member. */
  const people = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (mode === 'student') {
      const withRecords = new Set<string>();
      records.forEach((r) => {
        if (r.type === 'student' && r.date >= from && r.date <= effTo && r.studentId) {
          withRecords.add(r.studentId);
        }
      });
      return students
        .filter((s) => s.isActive || withRecords.has(s.id))
        .filter((s) => !parentMode || isOwnChild(s, currentUser))
        .filter((s) => classFilter === 'all' || `${s.class} - ${s.section}` === classFilter)
        .filter((s) => !query || [s.name, s.rollNumber, s.admissionNo]
          .some((v) => (v || '').toLowerCase().includes(query)))
        .sort((a, b) =>
          `${a.class} - ${a.section}`.localeCompare(`${b.class} - ${b.section}`, undefined, { numeric: true })
          || a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
    }
    const withRecords = new Set<string>();
    records.forEach((r) => {
      if (r.type === 'staff' && r.date >= from && r.date <= effTo && r.staffId) {
        withRecords.add(r.staffId);
      }
    });
    return staff
      .filter((s) => s.isActive || withRecords.has(s.id))
      .filter((s) => classFilter === 'all'
        || (s.assignedClasses || []).some((c) => c.trim().toLowerCase() === classFilter.trim().toLowerCase()))
      .filter((s) => !query || [s.name, s.role]
        .some((v) => (v || '').toLowerCase().includes(query)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, staff, records, mode, from, effTo, classFilter, q, parentMode, currentUser]);

  const summary = (personId: string) => {
    let p = 0, a = 0, marked = 0;
    dates.forEach((d) => {
      const st = byPersonDate.get(`${personId}|${d}`);
      if (!st) return;
      marked += 1;
      if (st === 'Present') p += 1;
      if (st === 'Absent') a += 1;
    });
    const pct = marked === 0 ? null : Math.round((p / marked) * 100);
    return { p, a, pct };
  };

  if (loadingRecords || loadingStudents || loadingStaff) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title={parentMode ? 'My Children\u2019s Attendance' : 'Attendance Register'}
        subtitle={parentMode
          ? 'Aapke bachon ki attendance — pichle 1 month ka record. Sirf dekh sakte hain, edit nahi.'
          : 'History — rows are people, columns are dates. Read-only; marking stays on the Attendance pages.'}
        pill={`${dates.length} days · ${people.length} ${parentMode ? 'children' : 'people'}`}
      />
      <div className="p-5">
        {!parentMode && (
          <Tabs
            active={mode}
            onChange={(id) => setMode(id as 'student' | 'staff')}
            tabs={[
              { id: 'student', label: 'Students' },
              { id: 'staff', label: 'Staff' },
            ]}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 mb-4">
          <Field label="From">
            <TextInput type="date" value={from} max={todayStr()} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {!parentMode && (
            <Field label="Class">
              <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="all">All Classes</option>
                {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          )}
          {!parentMode && (
            <Field label="Search person">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder={mode === 'student' ? 'Search name or roll…' : 'Search name…'}
              />
            </Field>
          )}
        </div>

        {rangeClamped && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Range zyada se zyada 31 din ki dikhai jati hai — {effTo} tak dikhaya ja raha hai.
          </div>
        )}

        {people.length === 0 ? (
          <EmptyState
            title={parentMode ? 'No attendance records' : 'No people found'}
            hint={parentMode ? 'Is range mein aapke bachon ki koi attendance nahi lagi.' : 'Try a different class or search.'}
          />
        ) : (
          <div className="overflow-x-auto nice-scroll border border-slate-200 rounded-xl">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 min-w-52 border-r border-slate-200">
                    {mode === 'student' ? 'Student' : 'Staff'}
                  </th>
                  {dates.map((d) => (
                    <th key={d} className="px-1.5 py-2 text-center min-w-10" title={d}>
                      {shortDate(d)}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center border-l border-slate-200" title="Present days">P</th>
                  <th className="px-2 py-2 text-center" title="Absent days">A</th>
                  <th className="px-2 py-2 text-center" title="Present % of marked days">%</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const s = summary(p.id);
                  const isStudent = mode === 'student';
                  const person = p as Student & StaffMember;
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={person.photo} name={person.name} size={30} />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {person.name}
                              {!person.isActive && (
                                <span className="ml-1 text-[10px] font-bold text-slate-400">(inactive)</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {isStudent
                                ? `Roll ${person.rollNumber} · ${person.class} - ${person.section}`
                                : (person.role === 'teacher' ? 'Teacher' : 'Staff')}
                            </div>
                          </div>
                        </div>
                      </td>
                      {dates.map((d) => {
                        const st = byPersonDate.get(`${p.id}|${d}`);
                        return (
                          <td key={d} className="px-1 py-1.5 text-center">
                            {st ? (
                              <span
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-extrabold ${CELL_TONE[st]}`}
                                title={`${d}: ${st}`}
                              >
                                {LETTER[st]}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-7 h-7 text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-bold text-emerald-700 border-l border-slate-200">{s.p}</td>
                      <td className="px-2 py-2 text-center font-bold text-rose-600">{s.a}</td>
                      <td className="px-2 py-2 text-center font-bold text-slate-700">
                        {s.pct === null ? '—' : `${s.pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span><b className="text-emerald-700">P</b> Present</span>
          <span><b className="text-rose-600">A</b> Absent</span>
          <span><b className="text-amber-700">L</b> Late</span>
          <span><b className="text-sky-700">H</b> Half Day</span>
          <span><b className="text-violet-700">Lv</b> Leave</span>
          <span><b>—</b> Not marked</span>
          <span className="ml-auto">% = Present ÷ marked days</span>
        </div>
      </div>
    </Card>
  );
};
