import React, { useMemo, useState } from 'react';
import { Clock3, Eraser, MapPin, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection, useDoc } from '../hooks/useFirestore';
import { ClassSection, StaffMember, Student, TimetableSlot } from '../types';
import {
  Badge, Card, CardHeader, EmptyState, Field, GhostButton, Modal, PrimaryButton,
  Select, Spinner, TextInput, useConfirm,
} from './ui';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

/* ------------------------------------------------------------------ */
/* Removable example timetable (Classes 3–8, clash-free by design).     */
/* Every example slot carries isExample:true and an `example_` doc id, */
/* so "Remove Example" deletes exactly these docs and nothing else.    */
/* No classes, students, staff or rules are touched.                   */
/* ------------------------------------------------------------------ */
const EXAMPLE_CLASSES = ['3', '4', '5', '6', '7', '8'];
const EXAMPLE_SECTION = 'A';
const EXAMPLE_TEACHERS = [
  { id: 'ex_teacher_0', name: 'Ahmed Khan', subject: 'Mathematics' },
  { id: 'ex_teacher_1', name: 'Fatima Raza', subject: 'English' },
  { id: 'ex_teacher_2', name: 'Bilal Hussain', subject: 'Urdu' },
  { id: 'ex_teacher_3', name: 'Ayesha Malik', subject: 'Science' },
  { id: 'ex_teacher_4', name: 'Usman Tariq', subject: 'Islamiat' },
  { id: 'ex_teacher_5', name: 'Sana Iqbal', subject: 'Computer' },
];
const PERIOD_TIMES = [
  '',
  '8:00 – 8:45', '8:45 – 9:30', '9:30 – 10:15',
  '10:45 – 11:30', '11:30 – 12:15', '12:15 – 1:00', '1:00 – 1:45',
];

const clsLabel = (c: string, s: string) => `${c} - ${s}`;
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'TIMETABLE',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

interface SlotForm {
  classSection: string; day: string; period: number; time: string;
  subject: string; teacherId: string; teacherName: string; room: string;
  editingId: string | null;
}

/**
 * Weekly timetable grid. Admin edits via modal; teachers see own slots;
 * everyone else sees read-only grid.
 */
export const TimetableManager: React.FC<{ editable?: boolean }> = ({ editable = false }) => {
  const { currentUser } = useAuth();
  const role = currentUser?.role;
  const canEdit = editable && role === 'admin';
  const { data: slots, loading } = useCollection<TimetableSlot>('timetable');
  const { data: classes } = useCollection<ClassSection>('classes');
  const { data: staff } = useCollection<StaffMember>('staff');
  const { data: students } = useCollection<Student>('students');
  const { data: myStaffDoc } = useDoc<StaffMember>('staff', currentUser?.staffId || 'none');
  const { ask, dialog } = useConfirm();

  const [classSection, setClassSection] = useState('');
  const [modal, setModal] = useState<SlotForm | null>(null);
  const [msg, setMsg] = useState('');
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [addingClass, setAddingClass] = useState(false);

  const teachers = useMemo(
    () => staff.filter((s) => s.isActive && s.role === 'teacher').sort((a, b) => a.name.localeCompare(b.name)),
    [staff]
  );

  const classOptions = useMemo(() => {
    // Merge every known class-section so the dropdown always lists all of them:
    // classes collection, active students, and existing timetable slots.
    const merged: string[] = [];
    const push = (v: string) => {
      const label = (v || '').trim();
      if (label && !merged.some((m) => m.toLowerCase() === label.toLowerCase())) merged.push(label);
    };
    classes.forEach((c) => push(clsLabel(c.name, c.section)));
    students.filter((s) => s.isActive).forEach((s) => push(clsLabel(s.class, s.section)));
    slots.forEach((s) => push(s.classSection));
    return merged.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [classes, students, slots]);

  const sel = classSection || classOptions[0] || '';

  const addClass = async () => {
    const name = newClassName.trim();
    const section = newSection.trim() || 'A';
    if (!name || !currentUser || addingClass) return;
    setAddingClass(true);
    try {
      await addDoc(collection(db, 'classes'), {
        name, section, subjects: [], academicYear: '',
      });
      await logAudit(currentUser.uid, currentUser.name, 'Added class', `${name} - ${section}`);
      setClassSection(clsLabel(name, section));
      setShowAddClass(false);
      setNewClassName('');
      setNewSection('');
      setMsg(`Class ${name} - ${section} added — you can now build its timetable.`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to add class.');
    } finally {
      setAddingClass(false);
    }
  };

  const myStaffId = currentUser?.staffId;

  // Teacher: own slots only, grouped by day
  const mySlots = useMemo(() => {
    if (role !== 'teacher' || !myStaffId) return [];
    return slots
      .filter((s) => s.teacherId === myStaffId)
      .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period);
  }, [slots, role, myStaffId]);

  const cellOf = (day: string, period: number) =>
    slots.find((s) => s.classSection === sel && s.day === day && s.period === period);

  const openAdd = (day: string, period: number) => {
    const existing = cellOf(day, period);
    setModal({
      classSection: sel, day, period,
      time: existing?.time || '', subject: existing?.subject || '',
      teacherId: existing?.teacherId || '', teacherName: existing?.teacherName || '',
      room: existing?.room || '', editingId: existing?.id || null,
    });
  };

  const saveSlot = async () => {
    if (!currentUser || !modal || !modal.subject.trim() || !sel) return;
    setMsg('');
    const id = sanitize(`${modal.classSection}_${modal.day}_${modal.period}`);
    try {
      await setDoc(doc(db, 'timetable', id), {
        classSection: modal.classSection, day: modal.day, period: modal.period,
        time: modal.time, subject: modal.subject.trim(),
        teacherId: modal.teacherId || '', teacherName: modal.teacherName,
        room: modal.room,
      }, { merge: true });
      await logAudit(currentUser.uid, currentUser.name,
        modal.editingId ? 'Updated timetable slot' : 'Added timetable slot',
        `${modal.classSection} — ${modal.day} P${modal.period}: ${modal.subject}`);
      setModal(null);
      setMsg('Timetable saved.');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    }
  };

  const deleteSlot = (slotId: string, label: string) => {
    if (!currentUser) return;
    ask({
      title: 'Delete slot',
      message: `Remove "${label}" from the timetable?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'timetable', slotId));
          await logAudit(currentUser.uid, currentUser.name, 'Deleted timetable slot', label);
        } catch (e: any) { setMsg(e?.message || 'Failed to delete.'); }
      },
    });
  };

  const [seeding, setSeeding] = useState(false);
  const hasExample = useMemo(() => slots.some((s) => s.isExample), [slots]);

  /**
   * Builds a clash-free example timetable:
   * teacher index = (period + class + day) mod 6, so within any single
   * day+period every class gets a DIFFERENT teacher — a clash is
   * impossible by construction. Each teacher owns one distinct subject,
   * so every class-day always shows 6 distinct subjects.
   */
  const loadExample = async () => {
    if (!currentUser || seeding) return;
    setSeeding(true);
    setMsg('');
    try {
      const planned: Array<Record<string, unknown> & { id: string }> = [];
      EXAMPLE_CLASSES.forEach((cls, c) => {
        const cs = clsLabel(cls, EXAMPLE_SECTION);
        DAYS.forEach((day, d) => {
          PERIODS.forEach((p) => {
            const t = EXAMPLE_TEACHERS[(p + c + d) % EXAMPLE_TEACHERS.length];
            planned.push({
              id: `example_${sanitize(cs)}_${day}_${p}`,
              classSection: cs, day, period: p,
              time: PERIOD_TIMES[p], subject: t.subject,
              teacherId: t.id, teacherName: t.name,
              room: `R-${cls}`, isExample: true,
            });
          });
        });
      });

      // Verify before writing: no teacher twice in one day+period,
      // and every class-day covers at least 5 distinct subjects.
      let clashes = 0;
      const perSlot = new Map<string, string[]>();
      planned.forEach((s) => {
        const key = `${s.day}|${s.period}`;
        const arr = perSlot.get(key) || [];
        if (arr.includes(s.teacherId as string)) clashes++;
        arr.push(s.teacherId as string);
        perSlot.set(key, arr);
      });
      const perClassDay = new Map<string, Set<string>>();
      planned.forEach((s) => {
        const key = `${s.classSection}|${s.day}`;
        if (!perClassDay.has(key)) perClassDay.set(key, new Set());
        perClassDay.get(key)!.add(s.subject as string);
      });
      const thinDays = [...perClassDay.values()].filter((set) => set.size < 5).length;
      if (clashes > 0 || thinDays > 0) {
        throw new Error(`Example failed verification (${clashes} clashes, ${thinDays} thin days) — nothing was written.`);
      }

      const batch = writeBatch(db);
      planned.forEach((s) => {
        const { id, ...data } = s;
        batch.set(doc(db, 'timetable', id), data);
      });
      await batch.commit();
      await logAudit(currentUser.uid, currentUser.name, 'Loaded example timetable',
        `${planned.length} example periods for classes 3–8 (0 clashes verified)`);
      setClassSection(clsLabel(EXAMPLE_CLASSES[0], EXAMPLE_SECTION));
      setMsg(`Example timetable loaded — ${planned.length} periods across classes 3–8, 6 teachers, 0 clashes. Use "Remove Example" anytime to delete it cleanly.`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load example timetable.');
    } finally {
      setSeeding(false);
    }
  };

  const removeExample = () => {
    if (!currentUser || seeding) return;
    ask({
      title: 'Remove example timetable',
      message: 'Delete all example periods? Only slots marked as example will be removed — your real timetable data stays untouched.',
      onConfirm: async () => {
        setSeeding(true);
        setMsg('');
        try {
          const snap = await getDocs(query(collection(db, 'timetable'), where('isExample', '==', true)));
          const batch = writeBatch(db);
          snap.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          await logAudit(currentUser.uid, currentUser.name, 'Removed example timetable',
            `${snap.size} example slots deleted`);
          setClassSection('');
          setMsg(`Example timetable removed — ${snap.size} periods deleted. Real data untouched.`);
        } catch (e: any) {
          setMsg(e?.message || 'Failed to remove example timetable.');
        } finally {
          setSeeding(false);
        }
      },
    });
  };

  if (loading) return <Spinner />;

  /* ---------- teacher: own slots list ---------- */
  if (role === 'teacher') {
    const groups = DAYS.map((d) => ({ day: d, slots: mySlots.filter((s) => s.day === d) }))
      .filter((g) => g.slots.length > 0);
    return (
      <Card>
        <CardHeader title="My Timetable"
          subtitle={myStaffDoc ? `Weekly schedule for ${myStaffDoc.name}` : 'Weekly schedule'}
          pill={`${mySlots.length} periods`} />
        <div className="p-5">
          {groups.length === 0 ? (
            <EmptyState title="No periods assigned" hint="Your classes will appear here once the admin sets the timetable." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map((g) => (
                <div key={g.day} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-sm font-bold text-indigo-800">{g.day}</div>
                  <div className="divide-y divide-slate-100">
                    {g.slots.map((s) => (
                      <div key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            P{s.period} · {s.subject}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>{s.classSection}</span>
                            {s.time && <span className="inline-flex items-center gap-1"><Clock3 className="w-3 h-3" />{s.time}</span>}
                            {s.room && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{s.room}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    );
  }

  /* ---------- grid view (admin edit / others read-only) ---------- */
  return (
    <Card>
      <CardHeader
        title="Class Timetable"
        subtitle={canEdit ? 'Click a cell to add or edit a period.' : 'Weekly schedule (read-only).'}
        action={
          <div className="flex items-center gap-2">
            <div className="w-48">
              <Select value={sel} onChange={(e) => setClassSection(e.target.value)}>
                {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setNewClassName(''); setNewSection(''); setShowAddClass(true); }}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-bold hover:bg-indigo-100 border border-indigo-200"
                title="Add new class"
              >
                <Plus className="w-4 h-4" /> Class
              </button>
            )}
            {canEdit && !hasExample && (
              <button
                type="button"
                onClick={loadExample}
                disabled={seeding}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-sm font-bold hover:bg-amber-100 border border-amber-200 disabled:opacity-50"
                title="Load a clash-free example timetable for classes 3–8 (removable)"
              >
                <Sparkles className="w-4 h-4" /> {seeding ? 'Loading…' : 'Example'}
              </button>
            )}
            {canEdit && hasExample && (
              <button
                type="button"
                onClick={removeExample}
                disabled={seeding}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-bold hover:bg-rose-100 border border-rose-200 disabled:opacity-50"
                title="Delete all example timetable slots (real data untouched)"
              >
                <Eraser className="w-4 h-4" /> {seeding ? 'Working…' : 'Remove Example'}
              </button>
            )}
          </div>
        }
      />
      <div className="p-5">
        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">{msg}</div>
        )}
        {!sel ? (
          <EmptyState title="No classes yet" />
        ) : (
          <div className="overflow-x-auto nice-scroll">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr>
                  <th className="p-2 text-left text-[11px] font-bold uppercase text-slate-500 w-24">Day</th>
                  {PERIODS.map((p) => (
                    <th key={p} className="p-2 text-center text-[11px] font-bold uppercase text-slate-500">P{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day} className="border-t border-slate-100">
                    <td className="p-2 font-bold text-slate-700 text-xs whitespace-nowrap">{day}</td>
                    {PERIODS.map((p) => {
                      const cell = cellOf(day, p);
                      return (
                        <td key={p} className="p-1 align-top">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => openAdd(day, p)}
                            className={`w-full min-h-[64px] rounded-lg border p-1.5 text-left transition-colors ${
                              canEdit ? 'hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer' : 'cursor-default'
                            } ${cell ? 'bg-white border-slate-200' : 'bg-slate-50 border-dashed border-slate-200'}`}
                          >
                            {cell ? (
                              <>
                                <div className="text-[11px] font-bold text-slate-900 leading-tight">{cell.subject}</div>
                                <div className="text-[10px] text-slate-500 truncate">{cell.teacherName}</div>
                                {cell.time && <div className="text-[10px] text-slate-400">{cell.time}</div>}
                                {cell.room && (
                                  <div className="mt-0.5"><Badge tone="slate">{cell.room}</Badge></div>
                                )}
                              </>
                            ) : canEdit ? (
                              <div className="flex items-center justify-center h-full text-slate-300">
                                <Plus className="w-4 h-4" />
                              </div>
                            ) : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.editingId ? 'Edit Period' : 'Add Period'}
          subtitle={`${modal.classSection} · ${modal.day} · Period ${modal.period}`}
          onClose={() => setModal(null)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Subject">
              <TextInput value={modal.subject} onChange={(e) => setModal({ ...modal, subject: e.target.value })} placeholder="e.g. Mathematics" />
            </Field>
            <Field label="Time">
              <TextInput value={modal.time} onChange={(e) => setModal({ ...modal, time: e.target.value })} placeholder="e.g. 8:00 – 8:45" />
            </Field>
            <Field label="Teacher">
              <Select
                value={modal.teacherId}
                onChange={(e) => {
                  const t = teachers.find((x) => x.id === e.target.value);
                  setModal({ ...modal, teacherId: e.target.value, teacherName: t?.name || '' });
                }}
              >
                <option value="">— Select teacher —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Room">
              <TextInput value={modal.room} onChange={(e) => setModal({ ...modal, room: e.target.value })} placeholder="e.g. Room 4" />
            </Field>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <div>
              {modal.editingId && (
                <button
                  type="button"
                  onClick={() => { deleteSlot(modal.editingId!, `${modal.subject} (${modal.day} P${modal.period})`); setModal(null); }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 hover:text-rose-800"
                >
                  <Trash2 className="w-4 h-4" /> Delete slot
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <GhostButton type="button" onClick={() => setModal(null)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={saveSlot} disabled={!modal.subject.trim()}>
                <Pencil className="w-4 h-4" /> Save
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
      {showAddClass && (
        <Modal title="Add Class" subtitle="The new class will appear in the dropdown right away." onClose={() => setShowAddClass(false)}>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Class name">
                <TextInput value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="e.g. 8" />
              </Field>
              <Field label="Section">
                <TextInput value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="e.g. B" />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <GhostButton type="button" onClick={() => setShowAddClass(false)}>Cancel</GhostButton>
              <PrimaryButton type="button" onClick={addClass} disabled={!newClassName.trim() || addingClass}>
                <Plus className="w-4 h-4" /> {addingClass ? 'Adding…' : 'Add Class'}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {dialog}
    </Card>
  );
};
