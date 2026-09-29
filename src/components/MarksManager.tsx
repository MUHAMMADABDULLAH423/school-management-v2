import React, { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { ClassSection, ExamResult, Student, gradeFor, isOwnChild, todayStr } from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Field, PrimaryButton, Select,
  Spinner, Table, TextInput,
} from './ui';

const EXAM_TYPES = ['Monthly Test', 'Mid Term', 'Final Exam'];

const clsLabel = (c: string, s: string) => `${c} - ${s}`;
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

const gradeTone = (g: string): 'green' | 'blue' | 'amber' | 'red' | 'slate' =>
  g === 'A+' || g === 'A' ? 'green' : g === 'B' || g === 'C' ? 'blue'
    : g === 'D' || g === 'E' ? 'amber' : g === 'F' ? 'red' : 'slate';

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'MARKS',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/** Read-only results for parents, grouped by exam. */
const ResultsReadOnly: React.FC<{
  students: Student[]; results: ExamResult[]; parentUid: string; parentEmail: string;
}> = ({ students, results, parentUid, parentEmail }) => {
  const myIds = useMemo(
    () => new Set(students.filter((s) => isOwnChild(s, { uid: parentUid, email: parentEmail })).map((s) => s.id)),
    [students, parentUid, parentEmail]
  );
  const nameOf = (id: string) => students.find((s) => s.id === id)?.name || '—';
  const mine = useMemo(() => results.filter((r) => myIds.has(r.studentId)), [results, myIds]);
  const groups = useMemo(() => {
    const g = new Map<string, ExamResult[]>();
    mine.forEach((r) => {
      const key = `${r.examType} — ${r.subject} (${r.date})`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    });
    return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [mine]);

  return (
    <Card>
      <CardHeader title="Exam Results" subtitle="Your children's results, grouped by exam." />
      <div className="p-5">
        {groups.length === 0 ? (
          <EmptyState title="No results yet" hint="Results appear here once teachers enter them." />
        ) : (
          <div className="space-y-4">
            {groups.map(([key, rows]) => (
              <div key={key} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-800">{key}</div>
                <Table head={['Student', 'Obtained', 'Total', 'Grade']}>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{nameOf(r.studentId)}</td>
                      <td className="px-3 py-2">{r.obtainedMarks}</td>
                      <td className="px-3 py-2">{r.totalMarks}</td>
                      <td className="px-3 py-2"><Badge tone={gradeTone(r.grade)}>{r.grade}</Badge></td>
                    </tr>
                  ))}
                </Table>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

/**
 * Marks entry (teacher/admin) — parent sees read-only view above.
 */
export const MarksManager: React.FC = () => {
  const { currentUser } = useAuth();
  const role = currentUser?.role;
  const { data: students, loading: loadingStudents } = useCollection<Student>('students');
  const { data: classes } = useCollection<ClassSection>('classes');
  const { data: results, loading: loadingResults } = useCollection<ExamResult>('results');

  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [subject, setSubject] = useState('');
  const [classSection, setClassSection] = useState('');
  const [date, setDate] = useState(todayStr());
  const [obtained, setObtained] = useState<Record<string, string>>({});
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const canWrite = role === 'teacher' || role === 'admin';

  const options = useMemo(() => {
    if (classes.length > 0) {
      return classes.map((c) => ({ value: clsLabel(c.name, c.section), label: clsLabel(c.name, c.section) }));
    }
    const seen = new Map<string, string>();
    students.filter((s) => s.isActive).forEach((s) => {
      const v = clsLabel(s.class, s.section);
      if (!seen.has(v)) seen.set(v, v);
    });
    return [...seen.keys()].map((v) => ({ value: v, label: v }));
  }, [classes, students]);

  const sel = classSection || options[0]?.value || '';

  const classStudents = useMemo(() => {
    if (!sel) return [];
    return students
      .filter((s) => s.isActive && clsLabel(s.class, s.section) === sel)
      .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));
  }, [students, sel]);

  const existingMap = useMemo(() => {
    const map: Record<string, ExamResult> = {};
    results
      .filter((r) => r.date === date && r.examType === examType && r.subject === subject && r.classSection === sel)
      .forEach((r) => { map[r.studentId] = r; });
    return map;
  }, [results, date, examType, subject, sel]);

  const obtOf = (id: string) => obtained[id] ?? (existingMap[id] ? String(existingMap[id].obtainedMarks) : '');
  const totOf = (id: string) => totals[id] ?? (existingMap[id] ? String(existingMap[id].totalMarks) : '100');

  const save = async () => {
    if (!currentUser || !sel || !subject.trim()) return;
    setSaving(true);
    setMsg('');
    let count = 0;
    try {
      for (const st of classStudents) {
        const obtStr = obtOf(st.id).trim();
        if (obtStr === '') continue;
        const obt = Math.max(0, Number(obtStr) || 0);
        const tot = Math.max(1, Number(totOf(st.id)) || 100);
        const grade = gradeFor(obt, tot);
        await setDoc(
          doc(db, 'results', sanitize(`${date}_${examType}_${subject}_${sel}_${st.id}`)),
          {
            studentId: st.id, subject: subject.trim(), examType, totalMarks: tot,
            obtainedMarks: obt, grade, classSection: sel, date, enteredBy: currentUser.name,
          },
          { merge: true }
        );
        count++;
      }
      await logAudit(currentUser.uid, currentUser.name, 'Entered marks',
        `${subject} (${examType}) for ${sel} on ${date} — ${count} students`);
      setObtained({});
      setTotals({});
      setMsg(`Saved marks for ${count} students.`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingStudents || loadingResults) return <Spinner />;
  if (!canWrite) {
    return <ResultsReadOnly students={students} results={results} parentUid={currentUser?.uid || ''} parentEmail={currentUser?.email || ''} />;
  }

  return (
    <Card>
      <CardHeader title="Marks Entry" subtitle="Enter marks per student — grades are calculated automatically." />
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Field label="Exam">
            <Select value={examType} onChange={(e) => { setExamType(e.target.value); setMsg(''); }}>
              {EXAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <TextInput value={subject} onChange={(e) => { setSubject(e.target.value); setMsg(''); }} placeholder="e.g. Mathematics" />
          </Field>
          <Field label="Class">
            <Select value={sel} onChange={(e) => { setClassSection(e.target.value); setMsg(''); }}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} max={todayStr()} onChange={(e) => { setDate(e.target.value); setMsg(''); }} />
          </Field>
        </div>

        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">{msg}</div>
        )}

        {!subject.trim() ? (
          <EmptyState title="Enter a subject to begin" hint="Type the subject name above, then enter marks below." />
        ) : classStudents.length === 0 ? (
          <EmptyState title="No students in this class" />
        ) : (
          <>
            <Table head={['Student', 'Obtained', 'Total Marks', 'Grade']}>
              {classStudents.map((st) => {
                const g = gradeFor(Number(obtOf(st.id)) || 0, Number(totOf(st.id)) || 100);
                return (
                  <tr key={st.id}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={st.photo} name={st.name} size={30} />
                        <div>
                          <div className="font-semibold text-slate-900">{st.name}</div>
                          <div className="text-[11px] text-slate-500">Roll {st.rollNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <TextInput type="number" min={0} className="w-24" placeholder="—"
                        value={obtOf(st.id)}
                        onChange={(e) => setObtained((p) => ({ ...p, [st.id]: e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput type="number" min={1} className="w-24"
                        value={totOf(st.id)}
                        onChange={(e) => setTotals((p) => ({ ...p, [st.id]: e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      {obtOf(st.id).trim() !== '' ? <Badge tone={gradeTone(g)}>{g}</Badge> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </Table>
            <div className="mt-4 flex justify-end">
              <PrimaryButton type="button" onClick={save} disabled={saving}>
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Marks'}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
