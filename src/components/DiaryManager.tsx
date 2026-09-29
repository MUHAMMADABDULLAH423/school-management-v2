import React, { useMemo, useState } from 'react';
import { BookOpenText, Plus } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection, useDoc } from '../hooks/useFirestore';
import { DiaryEntry, StaffMember, Student, isOwnChild, todayStr } from '../types';import {
  Badge, Card, CardHeader, EmptyState, Field, PrimaryButton, Select,
  Spinner, TextArea, TextInput,
} from './ui';

const clsLabel = (c: string, s: string) => `${c} - ${s}`;

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'DIARY',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * Class diary + homework (teacher/admin write; parent reads child's class).
 */
export const DiaryManager: React.FC<{ teacherOnly?: boolean }> = ({ teacherOnly = false }) => {
  const { currentUser } = useAuth();
  const role = currentUser?.role;
  const { data: entries, loading } = useCollection<DiaryEntry>('diary');
  const { data: students } = useCollection<Student>('students');

  // Staff doc via direct doc lookup as fallback
  const { data: myStaffDoc } = useDoc<StaffMember>('staff', currentUser?.staffId || 'none');

  const [classSection, setClassSection] = useState('');
  const [date, setDate] = useState(todayStr());
  const [content, setContent] = useState('');
  const [homeworkRaw, setHomeworkRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const canWrite = teacherOnly ? role === 'teacher' : role === 'teacher' || role === 'admin';

  // Classes available to the writer: own assigned classes, else derive from students
  const classOptions = useMemo(() => {
    const staffRec = myStaffDoc || null;
    const assigned = (staffRec?.assignedClasses || []).filter(Boolean);
    if (role === 'teacher' && assigned.length > 0) return assigned.map((v) => ({ value: v, label: v }));
    const seen = new Map<string, string>();
    students.filter((s) => s.isActive).forEach((s) => {
      const v = clsLabel(s.class, s.section);
      if (!seen.has(v)) seen.set(v, v);
    });
    return [...seen.keys()].map((v) => ({ value: v, label: v }));
  }, [myStaffDoc, students, role]);

  const sel = classSection || classOptions[0]?.value || '';

  // Parent: classes of own children
  const childClasses = useMemo(() => {
    if (!currentUser || role !== 'parent') return [];
    const set = new Set<string>();
    students
      .filter((s) => s.isActive && isOwnChild(s, currentUser))
      .forEach((s) => set.add(clsLabel(s.class, s.section)));
    return [...set];
  }, [students, currentUser, role]);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (role === 'parent') {
      list = list.filter((e) => childClasses.includes(e.classSection));
    }
    return list.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  }, [entries, role, childClasses]);

  const save = async () => {
    if (!currentUser || !sel || !content.trim()) return;
    setSaving(true);
    setMsg('');
    const homework = homeworkRaw.split('\n').map((l) => l.trim()).filter(Boolean);
    try {
      await addDoc(collection(db, 'diary'), {
        teacherId: currentUser.uid, classSection: sel, date,
        content: content.trim(), homework,
      });
      await logAudit(currentUser.uid, currentUser.name, 'Added diary entry',
        `${sel} on ${date}${homework.length ? ` (${homework.length} homework items)` : ''}`);
      setContent('');
      setHomeworkRaw('');
      setMsg('Diary entry saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Class Diary & Homework"
        subtitle={canWrite ? 'Log what was taught and assign homework.' : 'Diary entries for your class (read-only).'}
      />
      <div className="p-5">
        {canWrite && (
          <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Class">
                <Select value={sel} onChange={(e) => setClassSection(e.target.value)}>
                  {classOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Date">
                <TextInput type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Diary / What was taught" className="mb-3">
              <TextArea rows={3} value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="e.g. Completed Chapter 4 — Fractions. Started practice exercises on page 62…" />
            </Field>
            <Field label="Homework (one item per line)">
              <TextArea rows={3} value={homeworkRaw} onChange={(e) => setHomeworkRaw(e.target.value)}
                placeholder={'e.g.\nMath — Exercise 4.2 Q1–Q10\nUrdu — Learn lesson 5 vocabulary'} />
            </Field>
            {msg && <div className="mt-3 text-sm text-emerald-700">{msg}</div>}
            <div className="mt-3">
              <PrimaryButton type="button" onClick={save} disabled={saving || !content.trim()}>
                <Plus className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Entry'}
              </PrimaryButton>
            </div>
          </div>
        )}

        {visibleEntries.length === 0 ? (
          <EmptyState title="No diary entries" hint={role === 'parent' ? 'Entries appear here once teachers add them.' : 'Add the first entry above.'} />
        ) : (
          <div className="space-y-3">
            {visibleEntries.map((e) => (
              <div key={e.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge tone="blue">{e.classSection}</Badge>
                  <span className="text-xs text-slate-500">{e.date}</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{e.content}</p>
                {e.homework && e.homework.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                      <BookOpenText className="w-3.5 h-3.5" /> Homework
                    </div>
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
