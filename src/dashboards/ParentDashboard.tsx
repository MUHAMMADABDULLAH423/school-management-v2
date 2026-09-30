import React, { useMemo, useState } from 'react';
import {
  Printer,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection, useSchool } from '../hooks/useFirestore';
import {
  AttendanceRecord, DiaryEntry, ExamResult, FeeVoucher, SchoolProfile, Student,
  formatPKR, gradeFor, isOwnChild,
} from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, PrimaryButton,
  Spinner, Table,
} from '../components/ui';
import { NoticeList } from '../components/NoticeList';
// Built by a sibling agent — imported normally (default export):
import FeeVoucherPrint from '../components/FeeVoucherPrint';

const clsLabel = (c: string, s: string) => `${c} - ${s}`;

const feeTone = (s: string): 'green' | 'amber' | 'red' | 'blue' =>
  s === 'Paid' ? 'green' : s === 'Partial' ? 'blue' : s === 'Defaulter' ? 'red' : 'amber';

const attTone = (s: string): 'green' | 'red' | 'amber' | 'blue' | 'violet' =>
  s === 'Present' ? 'green' : s === 'Absent' ? 'red' : s === 'Late' ? 'amber'
    : s === 'HalfDay' ? 'blue' : 'violet';

const gradeTone = (g: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' =>
  g === 'A+' || g === 'A' ? 'green' : g === 'B' || g === 'C' ? 'blue'
    : g === 'D' || g === 'E' ? 'amber' : g === 'F' ? 'red' : 'slate';

/** Children of the current parent. */
function useChildren(currentUser: { uid: string; email: string } | null) {
  const { data: students, loading } = useCollection<Student>('students');
  const children = useMemo(
    () => students.filter((s) => s.isActive && isOwnChild(s, currentUser)),
    [students, currentUser]
  );
  return { children, students, loading };
}

const ChildrenTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { children, loading } = useChildren(currentUser);
  const { data: fees } = useCollection<FeeVoucher>('fees');
  const { data: attendance } = useCollection<AttendanceRecord>('attendance');

  const statsOf = (id: string) => {
    const recs = attendance.filter((a) => a.type === 'student' && a.studentId === id);
    const present = recs.filter((a) => a.status === 'Present' || a.status === 'Late' || a.status === 'HalfDay').length;
    const due = fees.filter((f) => f.studentId === id && f.status !== 'Paid')
      .reduce((s, f) => s + (Number(f.dueAmount) || 0), 0);
    return { attPct: recs.length > 0 ? Math.round((present / recs.length) * 100) : 0, due, recs: recs.length };
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {children.length === 0 ? (
        <Card><EmptyState title="No children linked" hint="Ask the school office to link your parent account to your child." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {children.map((c) => {
            const st = statsOf(c.id);
            return (
              <Card key={c.id}>
                <div className="p-5 flex items-start gap-4">
                  <Avatar src={c.photo} name={c.name} size={64} />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-extrabold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">Roll {c.rollNumber} · {clsLabel(c.class, c.section)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone={feeTone(c.feeStatus)}>Fee: {c.feeStatus}</Badge>
                      <span className="text-[11px] text-slate-500">
                        Attendance {st.attPct}% ({st.recs} days)
                      </span>
                    </div>
                    {st.due > 0 && (
                      <div className="mt-1 text-xs font-bold text-rose-600">Due: {formatPKR(st.due)}</div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AttendanceTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { children, loading } = useChildren(currentUser);
  const { data: records, loading: loadingAtt } = useCollection<AttendanceRecord>('attendance');
  const [childId, setChildId] = useState('');

  const ids = useMemo(() => new Set(children.map((c) => c.id)), [children]);
  const rows = useMemo(
    () => records
      .filter((r) => r.type === 'student' && r.studentId && ids.has(r.studentId) && (!childId || r.studentId === childId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 120),
    [records, ids, childId]
  );
  const nameOf = (id?: string) => children.find((c) => c.id === id)?.name || '—';

  if (loading || loadingAtt) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Attendance"
        subtitle="Daily attendance of your children."
        pill={`${rows.length}`}
        action={
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
          >
            <option value="">All children</option>
            {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        }
      />
      <div className="p-5">
        {rows.length === 0 ? (
          <EmptyState title="No attendance records" />
        ) : (
          <Table head={['Date', 'Child', 'Class', 'Status']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{r.date}</td>
                <td className="px-3 py-2">{nameOf(r.studentId)}</td>
                <td className="px-3 py-2 text-slate-600">{r.classSection || '—'}</td>
                <td className="px-3 py-2"><Badge tone={attTone(r.status)}>{r.status}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
};

const ResultsTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { children, students, loading } = useChildren(currentUser);
  const { data: results, loading: loadingRes } = useCollection<ExamResult>('results');

  const ids = useMemo(() => new Set(children.map((c) => c.id)), [children]);
  const groups = useMemo(() => {
    const g = new Map<string, ExamResult[]>();
    results.filter((r) => ids.has(r.studentId)).forEach((r) => {
      const key = `${r.examType} — ${r.subject} (${r.date})`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    });
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [results, ids]);
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || '—';

  if (loading || loadingRes) return <Spinner />;

  return (
    <Card>
      <CardHeader title="Exam Results" subtitle="Grouped by exam." />
      <div className="p-5">
        {groups.length === 0 ? (
          <EmptyState title="No results yet" hint="Results appear here once teachers enter them." />
        ) : (
          <div className="space-y-4">
            {groups.map(([key, rows]) => (
              <div key={key} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-800">{key}</div>
                <Table head={['Student', 'Obtained', 'Total', '%', 'Grade']}>
                  {rows.map((r) => {
                    const pct = r.totalMarks > 0 ? Math.round((r.obtainedMarks / r.totalMarks) * 100) : 0;
                    return (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{nameOf(r.studentId)}</td>
                        <td className="px-3 py-2">{r.obtainedMarks}</td>
                        <td className="px-3 py-2">{r.totalMarks}</td>
                        <td className="px-3 py-2">{pct}%</td>
                        <td className="px-3 py-2"><Badge tone={gradeTone(r.grade || gradeFor(r.obtainedMarks, r.totalMarks))}>{r.grade || gradeFor(r.obtainedMarks, r.totalMarks)}</Badge></td>
                      </tr>
                    );
                  })}
                </Table>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

const FeesTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { children, loading } = useChildren(currentUser);
  const { data: vouchers, loading: loadingFees } = useCollection<FeeVoucher>('fees');
  const { school } = useSchool();
  const [printVoucher, setPrintVoucher] = useState<FeeVoucher | null>(null);

  const ids = useMemo(() => new Set(children.map((c) => c.id)), [children]);
  const mine = useMemo(
    () => vouchers.filter((v) => ids.has(v.studentId)).sort((a, b) => b.month.localeCompare(a.month)),
    [vouchers, ids]
  );
  const studentOf = (id: string): Student | undefined => children.find((c) => c.id === id);
  const nameOf = (id: string) => studentOf(id)?.name || '—';

  if (loading || loadingFees) return <Spinner />;

  return (
    <Card>
      <CardHeader title="Fee Vouchers" subtitle="Your children's fee challans. Print any voucher." />
      <div className="p-5">
        {mine.length === 0 ? (
          <EmptyState title="No fee vouchers" hint="Vouchers appear here once the office generates them." />
        ) : (
          <Table head={['Voucher', 'Month', 'Child', 'Total', 'Paid', 'Due', 'Status', 'Print']}>
            {mine.map((v) => (
              <tr key={v.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{v.voucherNumber}</td>
                <td className="px-3 py-2 text-slate-600">{v.month}</td>
                <td className="px-3 py-2">{nameOf(v.studentId)}</td>
                <td className="px-3 py-2">{formatPKR(v.totalAmount)}</td>
                <td className="px-3 py-2">{formatPKR(v.paidAmount)}</td>
                <td className="px-3 py-2 font-bold text-rose-700">{formatPKR(v.dueAmount)}</td>
                <td className="px-3 py-2"><Badge tone={feeTone(v.status)}>{v.status}</Badge></td>
                <td className="px-3 py-2">
                  <PrimaryButton type="button" onClick={() => setPrintVoucher(v)} className="!px-3 !py-1.5 text-xs">
                    <Printer className="w-3.5 h-3.5" /> Print
                  </PrimaryButton>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {printVoucher && studentOf(printVoucher.studentId) && (
        <FeeVoucherPrint
          voucher={printVoucher}
          student={studentOf(printVoucher.studentId) as Student}
          school={school as SchoolProfile | null}
          onClose={() => setPrintVoucher(null)}
        />
      )}
    </Card>
  );
};

const DiaryTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { children, loading } = useChildren(currentUser);
  const { data: entries, loading: loadingDiary } = useCollection<DiaryEntry>('diary');

  const childClasses = useMemo(() => {
    const set = new Set<string>();
    children.forEach((c) => set.add(clsLabel(c.class, c.section)));
    return set;
  }, [children]);

  const rows = useMemo(
    () => entries.filter((e) => childClasses.has(e.classSection))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40),
    [entries, childClasses]
  );

  if (loading || loadingDiary) return <Spinner />;

  return (
    <Card>
      <CardHeader title="Class Diary & Homework" subtitle="Homework for your children's classes." />
      <div className="p-5">
        {rows.length === 0 ? (
          <EmptyState title="No diary entries" hint="Entries appear here once teachers add them." />
        ) : (
          <div className="space-y-3">
            {rows.map((e) => (
              <div key={e.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge tone="blue">{e.classSection}</Badge>
                  <span className="text-xs text-slate-500">{e.date}</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{e.content}</p>
                {e.homework && e.homework.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Homework</div>
                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">
                      {e.homework.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export const ParentDashboard: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  // Navigation lives in the sidebar / hamburger drawer; the tab mirrors the
  // selected nav item (Shell remounts on nav change via key).
  const tab = initialTab || 'children';

  return (
    <div>
      {tab === 'children' && <ChildrenTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'results' && <ResultsTab />}
      {tab === 'fees' && <FeesTab />}
      {tab === 'diary' && <DiaryTab />}
      {tab === 'notices' && (
        <Card>
          <CardHeader title="Notices" subtitle="Announcements from the school office." />
          <div className="p-5"><NoticeList /></div>
        </Card>
      )}
    </div>
  );
};

