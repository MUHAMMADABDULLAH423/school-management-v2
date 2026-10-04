import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Trash2, Users, CalendarDays } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { ClassSection, Student, TimetableSlot } from '../types';
import {
  Badge, Card, CardHeader, EmptyState, Field, GhostButton, Modal,
  PrimaryButton, Spinner, TextInput, useConfirm,
} from './ui';

const labelOf = (name: string, section: string) => `${name} - ${section}`;

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'CLASSES',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * Classes menu (admin + principal). Add/remove class + section.
 * These classes feed the timetable dropdown and the teacher "assigned
 * classes" picker. Deleting a class never touches students or slots —
 * the confirm dialog shows usage counts first.
 */
export const ClassesManager: React.FC = () => {
  const { currentUser } = useAuth();
  const { data: classes, loading } = useCollection<ClassSection>('classes');
  const { data: students } = useCollection<Student>('students');
  const { data: slots } = useCollection<TimetableSlot>('timetable');
  const { ask, dialog } = useConfirm();

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const sorted = useMemo(
    () => [...classes].sort((a, b) =>
      labelOf(a.name, a.section).localeCompare(labelOf(b.name, b.section), undefined, { numeric: true })),
    [classes]
  );

  const usage = useMemo(() => {
    const m = new Map<string, { students: number; slots: number }>();
    const key = (s: string) => s.trim().toLowerCase();
    students.forEach((s) => {
      if (!s.isActive) return;
      const k = key(labelOf(s.class, s.section));
      m.set(k, { students: (m.get(k)?.students || 0) + 1, slots: m.get(k)?.slots || 0 });
    });
    slots.forEach((s) => {
      const k = key(s.classSection);
      m.set(k, { students: m.get(k)?.students || 0, slots: (m.get(k)?.slots || 0) + 1 });
    });
    return m;
  }, [students, slots]);

  const addClass = async () => {
    const n = name.trim();
    const sec = section.trim() || 'A';
    if (!n || !currentUser || saving) return;
    const label = labelOf(n, sec);
    if (sorted.some((c) => labelOf(c.name, c.section).toLowerCase() === label.toLowerCase())) {
      setMsg(`Class ${label} already exists.`);
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'classes'), { name: n, section: sec, subjects: [], academicYear: '' });
      await logAudit(currentUser.uid, currentUser.name, 'Added class', label);
      setName(''); setSection(''); setShowAdd(false);
      setMsg(`Class ${label} added — it now appears in the timetable and teacher class pickers.`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to add class.');
    } finally {
      setSaving(false);
    }
  };

  const removeClass = (c: ClassSection) => {
    if (!currentUser) return;
    const label = labelOf(c.name, c.section);
    const u = usage.get(label.toLowerCase()) || { students: 0, slots: 0 };
    const warn = (u.students > 0 || u.slots > 0)
      ? ` Warning: ${u.students} student(s) and ${u.slots} timetable period(s) still reference this class — they will keep the old label.`
      : '';
    ask({
      title: 'Remove class',
      message: `Remove class "${label}"?${warn}`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'classes', c.id));
          await logAudit(currentUser.uid, currentUser.name, 'Removed class', label);
          setMsg(`Class ${label} removed.`);
        } catch (e: any) {
          setMsg(e?.message || 'Failed to remove class.');
        }
      },
    });
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Classes"
        subtitle="Add or remove classes and sections. They appear in the timetable dropdown and teacher class picker."
        pill={`${sorted.length} classes`}
        action={
          <button
            type="button"
            onClick={() => { setName(''); setSection(''); setMsg(''); setShowAdd(true); }}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> Add Class
          </button>
        }
      />
      <div className="p-5">
        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">{msg}</div>
        )}
        {sorted.length === 0 ? (
          <EmptyState title="No classes yet" hint="Click “Add Class” to create your first class and section." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((c) => {
              const u = usage.get(labelOf(c.name, c.section).toLowerCase()) || { students: 0, slots: 0 };
              return (
                <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900">{labelOf(c.name, c.section)}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="slate"><Users className="w-3 h-3" /> {u.students} students</Badge>
                      <Badge tone="slate"><CalendarDays className="w-3 h-3" /> {u.slots} periods</Badge>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeClass(c)}
                    className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-rose-600 hover:text-rose-800 px-2 py-1.5 rounded-lg hover:bg-rose-50"
                    title={`Remove ${labelOf(c.name, c.section)}`}
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Class" subtitle="The class will appear in the timetable and teacher pickers right away." onClose={() => setShowAdd(false)}>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Class name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 1" />
              </Field>
              <Field label="Section">
                <TextInput value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. A" />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <GhostButton type="button" onClick={() => setShowAdd(false)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={addClass} disabled={!name.trim() || saving}>
                <Plus className="w-4 h-4" /> {saving ? 'Adding…' : 'Add Class'}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
      {dialog}
    </Card>
  );
};
