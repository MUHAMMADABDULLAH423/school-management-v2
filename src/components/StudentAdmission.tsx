/**
 * StudentAdmission — ADMIN ONLY student admission + student registry.
 *
 * Guarded by <RequireRole roles={['admin']}> at the dashboard level AND by
 * firestore.rules (students: write = admin only). Never render for principal.
 *
 * NOTE: parent portal login is created separately via UserManager. Linking is
 * automatic when the parent's login email matches this student's parentEmail
 * (fallback); optionally set `parentId` to the parent's auth uid as well.
 */
import React, { useMemo, useState } from 'react';
import {
  addDoc, collection, doc, updateDoc,
} from 'firebase/firestore';
import { UserPlus, Pencil, Power, PowerOff, Eye } from 'lucide-react';
import { db } from '../config/firebase';
import { useCollection, useSchool } from '../hooks/useFirestore';
import { useAuth } from '../context/AuthContext';
import { Student, FeeStatus } from '../types';
import {
  Card, CardHeader, Modal, Field, TextInput, Select, PrimaryButton, GhostButton,
  Badge, Avatar, SearchInput, Table, EmptyState, Spinner, useConfirm,
} from './ui';
import { ImageUploadField } from './ImageUploadField';

const FEE_STATUSES: FeeStatus[] = ['Paid', 'Partial', 'Pending', 'Defaulter'];

const feeBadgeTone = (s: FeeStatus): 'green' | 'amber' | 'blue' | 'red' =>
  s === 'Paid' ? 'green' : s === 'Partial' ? 'amber' : s === 'Pending' ? 'blue' : 'red';

async function auditLog(userId: string, userName: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId, userName, action, category: 'STUDENT', details,
      timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break the app */ }
}

interface FormState {
  name: string;
  photo: string;
  class: string;
  section: string;
  rollNumber: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  parentName: string;
  parentPhone: string;
  parentWhatsApp: string;
  parentEmail: string;
  feeStatus: FeeStatus;
}

const emptyForm = (): FormState => ({
  name: '', photo: '', class: '', section: '', rollNumber: '', dob: '',
  gender: 'Male', address: '', parentName: '', parentPhone: '',
  parentWhatsApp: '', parentEmail: '', feeStatus: 'Pending',
});

const StudentAdmission: React.FC = () => {
  const { data: students, loading } = useCollection<Student>('students');
  const { school } = useSchool();
  const { currentUser } = useAuth();
  const { ask, dialog } = useConfirm();

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [photoRecordId, setPhotoRecordId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const classOptions = useMemo(
    () => Array.from(new Set(students.map((s) => s.class))).filter(Boolean).sort(),
    [students]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => (classFilter === 'all' ? true : s.class === classFilter))
      .filter((s) =>
        !q
          ? true
          : [s.name, s.rollNumber, s.parentName, s.parentPhone].some((v) =>
              (v || '').toLowerCase().includes(q)
            )
      )
      .sort((a, b) => a.class.localeCompare(b.class) || a.rollNumber.localeCompare(b.rollNumber));
  }, [students, search, classFilter]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setPhotoRecordId(`new-${Date.now()}`); // fresh record id once per modal open
    setError('');
    setModalOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      name: s.name || '', photo: s.photo || '', class: s.class || '', section: s.section || '',
      rollNumber: s.rollNumber || '', dob: s.dob || '', gender: s.gender || 'Male',
      address: s.address || '', parentName: s.parentName || '', parentPhone: s.parentPhone || '',
      parentWhatsApp: s.parentWhatsApp || '', parentEmail: s.parentEmail || '',
      feeStatus: s.feeStatus || 'Pending',
    });
    setPhotoRecordId(s.id);
    setError('');
    setModalOpen(true);
  };

  const validate = (): boolean => {
    if (!form.name.trim() || !form.class.trim() || !form.section.trim() || !form.rollNumber.trim()) {
      setError('Name, Class, Section and Roll Number are required.');
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!validate() || !currentUser) return;
    setSaving(true);
    try {
      const academicYear = school?.academicYear || `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`;
      const payload = {
        name: form.name.trim(),
        photo: form.photo || '',
        class: form.class.trim(),
        section: form.section.trim(),
        rollNumber: form.rollNumber.trim(),
        dob: form.dob,
        gender: form.gender,
        address: form.address.trim(),
        parentName: form.parentName.trim(),
        parentPhone: form.parentPhone.trim(),
        parentWhatsApp: form.parentWhatsApp.trim(),
        parentEmail: form.parentEmail.trim().toLowerCase(),
        feeStatus: form.feeStatus,
        academicYear,
      };
      if (editing) {
        await updateDoc(doc(db, 'students', editing.id), payload);
        await auditLog(currentUser.uid, currentUser.name, 'Student updated',
          `Updated ${payload.name} (${payload.rollNumber}, ${payload.class}-${payload.section})`);
      } else {
        await addDoc(collection(db, 'students'), {
          ...payload,
          parentId: '',
          isActive: true,
          createdAt: new Date().toISOString(),
        });
        await auditLog(currentUser.uid, currentUser.name, 'Student admitted',
          `Admitted ${payload.name} (${payload.rollNumber}, ${payload.class}-${payload.section})`);
      }
      setModalOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (s: Student) => {
    if (!currentUser) return;
    if (s.isActive) {
      ask({
        title: 'Deactivate student',
        message: `Deactivate ${s.name} (${s.rollNumber})? Their record stays for history but they will be excluded from vouchers and attendance.`,
        confirmLabel: 'Deactivate',
        onConfirm: async () => {
          await updateDoc(doc(db, 'students', s.id), { isActive: false });
          await auditLog(currentUser.uid, currentUser.name, 'Student deactivated',
            `Deactivated ${s.name} (${s.rollNumber})`);
        },
      });
    } else {
      updateDoc(doc(db, 'students', s.id), { isActive: true }).then(() =>
        auditLog(currentUser.uid, currentUser.name, 'Student reactivated',
          `Reactivated ${s.name} (${s.rollNumber})`)
      );
    }
  };

  return (
    <div>
      <Card>
        <CardHeader
          title="Students"
          subtitle={`${filtered.length} of ${students.length} students`}
          action={
            <PrimaryButton onClick={openAdd}>
              <UserPlus className="w-4 h-4" /> Admit Student
            </PrimaryButton>
          }
        />
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, roll, parent…" />
          </div>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="sm:w-44">
            <option value="all">All classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No students found" hint="Admit the first student to get started." />
        ) : (
          <Table head={['Student', 'Roll', 'Class', 'Parent', 'Fee Status', 'Active', '']}>
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={s.photo} name={s.name} size={36} />
                    <span className="font-semibold text-slate-900">{s.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-600">{s.rollNumber}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                  {s.class}-{s.section}
                </td>
                <td className="px-3 py-2">
                  <div className="text-slate-800">{s.parentName || '—'}</div>
                  <div className="text-xs text-slate-500">{s.parentPhone || s.parentWhatsApp || ''}</div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={feeBadgeTone(s.feeStatus)}>{s.feeStatus}</Badge>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(s)}
                    title={s.isActive ? 'Deactivate' : 'Reactivate'}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${
                      s.isActive
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                  >
                    {s.isActive ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                    {s.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setViewing(s)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                    title="View full detail"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {modalOpen && (
        <Modal
          wide
          title={editing ? 'Edit Student' : 'Admit New Student'}
          subtitle="Only admin can admit or edit students"
          onClose={() => setModalOpen(false)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 flex justify-center">
              <ImageUploadField
                value={form.photo}
                onChange={(url: string) => setForm((f) => ({ ...f, photo: url }))}
                recordId={photoRecordId}
                label="Student photo"
              />
            </div>
            <Field label="Full name *">
              <TextInput value={form.name} onChange={set('name')} placeholder="e.g. Ahmed Raza" />
            </Field>
            <Field label="Roll number *">
              <TextInput value={form.rollNumber} onChange={set('rollNumber')} placeholder="e.g. 6A-012" />
            </Field>
            <Field label="Class *">
              <TextInput value={form.class} onChange={set('class')} placeholder="e.g. 6" />
            </Field>
            <Field label="Section *">
              <TextInput value={form.section} onChange={set('section')} placeholder="e.g. A" />
            </Field>
            <Field label="Date of birth">
              <TextInput type="date" value={form.dob} onChange={set('dob')} />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={set('gender')}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <TextInput value={form.address} onChange={set('address')} placeholder="Home address" />
              </Field>
            </div>
            <Field label="Parent / guardian name">
              <TextInput value={form.parentName} onChange={set('parentName')} />
            </Field>
            <Field label="Parent phone">
              <TextInput value={form.parentPhone} onChange={set('parentPhone')} placeholder="03xxxxxxxxx" />
            </Field>
            <Field label="Parent WhatsApp">
              <TextInput value={form.parentWhatsApp} onChange={set('parentWhatsApp')} placeholder="03xxxxxxxxx" />
            </Field>
            <Field label="Parent email">
              <TextInput type="email" value={form.parentEmail} onChange={set('parentEmail')} />
            </Field>
            <Field label="Fee status">
              <Select value={form.feeStatus} onChange={set('feeStatus')}>
                {FEE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton onClick={() => setModalOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Admit Student'}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal
          title="Student Detail"
          subtitle={`${viewing.name} · Roll ${viewing.rollNumber || '—'}`}
          onClose={() => setViewing(null)}
        >
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
            <Avatar src={viewing.photo} name={viewing.name} size={72} />
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900 truncate">{viewing.name}</div>
              <div className="text-sm text-slate-500">
                Class {viewing.class}-{viewing.section} · Roll {viewing.rollNumber || '—'}
              </div>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <Badge tone={viewing.isActive ? 'green' : 'red'}>
                  {viewing.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Badge tone={feeBadgeTone(viewing.feeStatus)}>{viewing.feeStatus}</Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-4">
            <DetailRow label="Father / Guardian" value={viewing.parentName} />
            <DetailRow label="Date of Birth" value={viewing.dob} />
            <DetailRow label="Gender" value={viewing.gender} />
            <DetailRow label="Class" value={viewing.class} />
            <DetailRow label="Section" value={viewing.section} />
            <DetailRow label="Roll Number" value={viewing.rollNumber} />
            <DetailRow label="Parent Phone" value={viewing.parentPhone} />
            <DetailRow label="Parent WhatsApp" value={viewing.parentWhatsApp} />
            <DetailRow label="Parent Email" value={viewing.parentEmail} />
            <DetailRow label="Academic Year" value={viewing.academicYear} />
            <DetailRow label="Fee Status" value={viewing.feeStatus} />
            <DetailRow label="Status" value={viewing.isActive ? 'Active' : 'Inactive'} />
            <div className="sm:col-span-2">
              <DetailRow label="Address" value={viewing.address} />
            </div>
          </div>
        </Modal>
      )}
      {dialog}
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="text-sm font-semibold text-slate-800 mt-0.5 break-words">{value || '—'}</div>
  </div>
);

export default StudentAdmission;
