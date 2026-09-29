import React, { useMemo, useState } from 'react';
import { CheckCircle2, Save, Users } from 'lucide-react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import {
  AttendanceRecord, AttendanceStatus, ClassSection, Student, todayStr,
} from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Field, GhostButton,
  PrimaryButton, Select, Spinner, TextInput,
} from './ui';

const STATUSES: AttendanceStatus[] = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];

const statusTone = (s: AttendanceStatus): 'green' | 'red' | 'amber' | 'blue' | 'violet' =>
  s === 'Present' ? 'green' : s === 'Absent' ? 'red' : s === 'Late' ? 'amber'
    : s === 'HalfDay' ? 'blue' : 'violet';

const clsLabel = (c: string, s: string) => `${c} - ${s}`;

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'ATTENDANCE',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * Mark student attendance by class + date (teacher, admin).
 * Doc id = `${date}_${studentId}`, type 'student'.
 */
export const AttendanceManager: React.FC = () => {
  const { currentUser } = useAuth();
  const { data: students, loading: loadingStudents } = useCollection<Student>('students');
  const { data: classes } = useCollection<ClassSection>('classes');
  const { data: records, loading: loadingRecords } = useCollection<AttendanceRecord>('attendance');

  const [classSection, setClassSection] = useState('');
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Class options: prefer classes collection, fallback to students' class/section combos
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

  const existingForDate = useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    records
      .filter((r) => r.type === 'student' && r.date === date && r.classSection === sel)
      .forEach((r) => { if (r.studentId) map[r.studentId] = r; });
    return map;
  }, [records, date, sel]);

  const markOf = (id: string): AttendanceStatus =>
    marks[id] ?? existingForDate[id]?.status ?? 'Present';

  const markAll = (s: AttendanceStatus) => {
    const next: Record<string, AttendanceStatus> = {};
    classStudents.forEach((st) => { next[st.id] = s; });
    setMarks(next);
  };

  const save = async () => {
    if (!currentUser || !sel || classStudents.length === 0) return;
    setSaving(true);
    setSavedMsg('');
    const counts: Record<string, number> = {};
    try {
      for (const st of classStudents) {
        const status = markOf(st.id);
        counts[status] = (counts[status] || 0) + 1;
        await setDoc(doc(db, 'attendance', `${date}_${st.id}`), {
          type: 'student', studentId: st.id, status, date,
          markedBy: currentUser.name, classSection: sel,
        }, { merge: true });
      }
      const summary = STATUSES.map((s) => (counts[s] ? `${counts[s]} ${s}` : '')).filter(Boolean).join(', ');
      await logAudit(currentUser.uid, currentUser.name, 'Marked student attendance',
        `${sel} on ${date} — ${summary || 'no marks'}`);
      setMarks({});
      setSavedMsg(`Saved attendance for ${classStudents.length} students on ${date}.`);
    } catch (e: any) {
      setSavedMsg(e?.message || 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingStudents || loadingRecords) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Student Attendance"
        subtitle="Select a class and date, mark each student, then save."
        pill={`${date}`}
      />
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Field label="Class">
            <Select value={sel} onChange={(e) => { setClassSection(e.target.value); setMarks({}); setSavedMsg(''); }}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} max={todayStr()} onChange={(e) => { setDate(e.target.value); setMarks({}); setSavedMsg(''); }} />
          </Field>
          <div className="flex items-end gap-2">
            <GhostButton type="button" onClick={() => markAll('Present')} className="flex-1">
              <CheckCircle2 className="w-4 h-4" /> All Present
            </GhostButton>
            <PrimaryButton type="button" onClick={save} disabled={saving || classStudents.length === 0} className="flex-1">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
            </PrimaryButton>
          </div>
        </div>

        {savedMsg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            {savedMsg}
          </div>
        )}

        {classStudents.length === 0 ? (
          <EmptyState title="No students in this class" hint="Admissions add students via the Admin panel." />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Users className="w-3.5 h-3.5" /> {classStudents.length} students
              {Object.keys(existingForDate).length > 0 && (
                <span className="ml-2">• {Object.keys(existingForDate).length} already marked for this date</span>
              )}
            </div>
            {classStudents.map((st) => {
              const m = markOf(st.id);
              return (
                <div key={st.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50/60">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Avatar src={st.photo} name={st.name} size={34} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{st.name}</div>
                      <div className="text-[11px] text-slate-500">Roll {st.rollNumber}</div>
                    </div>
                    <Badge tone={statusTone(m)}>{m}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setMarks((p) => ({ ...p, [st.id]: s }))}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                          m === s
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};
