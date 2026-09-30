import React, { useMemo, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { Pencil, Plus, UserCheck, UserX, Eye } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { StaffMember, StaffRole, pendingUserDocId, formatPKR } from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Field, GhostButton, Modal,
  PrimaryButton, SearchInput, Select, Spinner, Table, TextInput, useConfirm,
} from './ui';
import { ImageUploadField } from './ImageUploadField';

interface StaffManagerProps {
  /** Admin passes true; principal passes false — principals can never re-role a user. */
  allowRoleChange?: boolean;
}

interface StaffForm {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  designation: string;
  department: string;
  qualification: string;
  subjectsCsv: string;
  classesCsv: string;
  salary: string;
  joiningDate: string;
  photo: string;
}

const emptyForm = (): StaffForm => ({
  name: '', email: '', phone: '', role: 'teacher',
  designation: '', department: '', qualification: '',
  subjectsCsv: '', classesCsv: '', salary: '', joiningDate: '', photo: '',
});

const csvToArr = (s: string): string[] =>
  s.split(',').map((p) => p.trim()).filter(Boolean);

export const StaffManager: React.FC<StaffManagerProps> = ({ allowRoleChange = false }) => {
  const { currentUser } = useAuth();
  const { data: staff, loading } = useCollection<StaffMember>('staff');
  const { ask, dialog } = useConfirm();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<StaffMember | null>(null);
  /** Stable doc id for the record being edited/added — also the ImageUploadField recordId. */
  const [modalId, setModalId] = useState('');
  const [form, setForm] = useState<StaffForm>(emptyForm());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const logAudit = async (action: string, details: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'auditLog'), {
        userId: currentUser.uid,
        userName: currentUser.name,
        action,
        category: 'STAFF',
        details,
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* audit must never break the UI */
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff
      .filter((m) => {
        if (roleFilter !== 'all' && m.role !== roleFilter) return false;
        if (!q) return true;
        return [m.name, m.email, m.designation, m.department, m.phone]
          .some((v) => (v || '').toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, search, roleFilter]);

  const openAdd = () => {
    // Generate the final Firestore doc id ONCE, up front — the staff doc and
    // the users doc will share it, and it is the stable recordId for the
    // photo upload (no orphaned Storage folders for unsaved records).
    setModalId(doc(collection(db, 'staff')).id);
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setModalOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setModalId(m.id);
    setEditingId(m.id);
    setForm({
      name: m.name || '',
      email: m.email || '',
      phone: m.phone || '',
      role: m.role || 'teacher',
      designation: m.designation || '',
      department: m.department || '',
      qualification: m.qualification || '',
      subjectsCsv: (m.subjects || []).join(', '),
      classesCsv: (m.assignedClasses || []).join(', '),
      salary: m.salary != null ? String(m.salary) : '',
      joiningDate: m.joiningDate || '',
      photo: m.photo || '',
    });
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    if (!name) return setError('Full name is required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('A valid email address is required.');
    if (!phone) return setError('Phone number is required.');
    if (form.role !== 'teacher' && form.role !== 'staff') {
      return setError('Role must be teacher or staff.');
    }

    setSaving(true);
    setError('');
    try {
      if (!editingId) {
        // Email must be unique across users — it becomes the login identity.
        const dup = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
        if (!dup.empty) {
          setSaving(false);
          return setError('A user with this email already exists.');
        }
      }

      const subjects = csvToArr(form.subjectsCsv);
      const assignedClasses = csvToArr(form.classesCsv);
      const salaryNum = form.salary.trim() === '' ? undefined : Number(form.salary);

      const staffPayload: Record<string, unknown> = {
        id: modalId,
        name,
        email,
        phone,
        role: form.role,
        designation: form.designation.trim(),
        department: form.department.trim(),
        qualification: form.qualification.trim(),
        subjects,
        assignedClasses,
        joiningDate: form.joiningDate,
        userId: modalId,
      };
      if (form.photo.trim()) staffPayload.photo = form.photo.trim();
      if (salaryNum !== undefined && !Number.isNaN(salaryNum)) staffPayload.salary = salaryNum;

      if (!editingId) {
        staffPayload.isActive = true;
        staffPayload.createdAt = new Date().toISOString();
        await setDoc(doc(db, 'staff', modalId), staffPayload);

        // NOTE: the users (login) doc uses an email-keyed placeholder id.
        // The Firebase Auth login for this email must be created separately in
        // Firebase Console → Authentication (email/password). On first login
        // the app adopts the placeholder to the real auth uid by direct
        // document read (see AuthContext.loadProfile), then forces a password
        // change (isFirstLogin=true).
        const userPayload: Record<string, unknown> = {
          uid: pendingUserDocId(email),
          name,
          email,
          role: form.role,
          phone,
          schoolId: 'main',
          staffId: modalId,
          isActive: true,
          isFirstLogin: true,
          createdAt: new Date().toISOString(),
        };
        if (form.photo.trim()) userPayload.photoURL = form.photo.trim();
        await setDoc(doc(db, 'users', pendingUserDocId(email)), userPayload);

        await logAudit('Staff added', `${name} (${form.role}) — ${email}`);
      } else {
        const current = staff.find((m) => m.id === editingId);
        await setDoc(doc(db, 'staff', editingId), staffPayload, { merge: true });
        // Limited fields on the users doc: principals may only touch
        // name/phone/photoURL/isActive (role change is admin-only and the
        // select is disabled for principals in the UI; rules enforce it too).
        const userPayload: Record<string, unknown> = {
          name,
          phone,
          isActive: current ? current.isActive : true,
          staffId: editingId,
        };
        if (form.photo.trim()) userPayload.photoURL = form.photo.trim();
        if (allowRoleChange) userPayload.role = form.role;
        const userRef = await findUserDoc(current ? current.email : email);
        if (userRef) await setDoc(userRef, userPayload, { merge: true });

        await logAudit('Staff updated', `${name} (${form.role}) — profile updated`);
      }

      setModalOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

    /** Find the login (users) doc for a staff email — placeholder or adopted. */
  const findUserDoc = async (email: string) => {
    const qs = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
    return qs.empty ? null : qs.docs[0].ref;
  };

  const toggleActive = (m: StaffMember) => {
    const next = !m.isActive;
    ask({
      title: next ? 'Activate staff member' : 'Deactivate staff member',
      message: next
        ? `Activate ${m.name}? They will regain access to the school app.`
        : `Deactivate ${m.name}? They will lose access to the school app immediately. Their record is kept (soft deactivation) and can be reactivated later.`,
      confirmLabel: next ? 'Activate' : 'Deactivate',
      onConfirm: async () => {
        // Soft deactivate/activate — never hard delete, on BOTH docs.
        await setDoc(doc(db, 'staff', m.id), { isActive: next }, { merge: true });
        const userRef = await findUserDoc(m.email);
        if (userRef) await setDoc(userRef, { isActive: next }, { merge: true });
        await logAudit(
          next ? 'Staff activated' : 'Staff deactivated',
          `${m.name} (${m.role}) — isActive=${next}`
        );
      },
    });
  };

  const setField = <K extends keyof StaffForm>(k: K, v: StaffForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isEdit = editingId !== null;

  return (
    <Card>
      <CardHeader
        title="Teachers & Staff"
        subtitle="Manage teaching and non-teaching staff. Photos, subjects and class assignments live here."
        pill={`${filtered.length} member${filtered.length === 1 ? '' : 's'}`}
        action={
          <PrimaryButton onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Teacher / Staff
          </PrimaryButton>
        }
      />
      <div className="p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, designation, department, phone…"
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | StaffRole)}
            className="sm:w-44"
          >
            <option value="all">All roles</option>
            <option value="teacher">Teachers</option>
            <option value="staff">Staff</option>
          </Select>
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={staff.length === 0 ? 'No staff yet' : 'No matches found'}
            hint={staff.length === 0 ? 'Add your first teacher or staff member to get started.' : 'Try a different search or role filter.'}
          />
        ) : (
          <Table head={['Member', 'Role', 'Designation', 'Department', 'Phone', 'Classes', 'Status', '']}>
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={m.photo} name={m.name} size={36} />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{m.name}</div>
                      <div className="text-xs text-slate-500 truncate">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={m.role === 'teacher' ? 'blue' : 'violet'}>
                    {m.role === 'teacher' ? 'Teacher' : 'Staff'}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{m.designation || '—'}</td>
                <td className="px-3 py-2.5 text-slate-700">{m.department || '—'}</td>
                <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{m.phone || '—'}</td>
                <td className="px-3 py-2.5">
                  <span className="text-slate-700" title={(m.assignedClasses || []).join(', ')}>
                    {(m.assignedClasses || []).length > 0
                      ? (m.assignedClasses || []).slice(0, 3).join(', ') +
                        ((m.assignedClasses || []).length > 3 ? ` +${(m.assignedClasses || []).length - 3}` : '')
                      : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={m.isActive ? 'green' : 'red'}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => setViewing(m)}
                    title="View full detail"
                    className="inline-flex p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 mr-1"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    title="Edit"
                    className="inline-flex p-1.5 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 mr-1"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(m)}
                    title={m.isActive ? 'Deactivate' : 'Activate'}
                    className={`inline-flex p-1.5 rounded-lg ${
                      m.isActive
                        ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-700'
                        : 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    {m.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      {modalOpen && (
        <Modal
          title={isEdit ? 'Edit Teacher / Staff' : 'Add Teacher / Staff'}
          subtitle={
            isEdit
              ? 'Update profile details. Email cannot be changed — it is the login identity.'
              : 'A staff record and login user will be created. The Firebase Auth login for this email must be created in Firebase Console → Authentication.'
          }
          onClose={() => setModalOpen(false)}
          wide
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Field label="Photo">
                <ImageUploadField
                  value={form.photo}
                  onChange={(url) => setField('photo', url)}
                  recordId={modalId}
                />
              </Field>
            </div>
            <Field label="Full name *">
              <TextInput
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Ahmed Raza"
              />
            </Field>
            <Field label="Email (login ID) *">
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="e.g. ahmed.raza@school.pk"
                disabled={isEdit}
                title={isEdit ? 'Email cannot be changed — it is the login identity.' : undefined}
              />
            </Field>
            <Field label="Phone *">
              <TextInput
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="e.g. 0300 1234567"
              />
            </Field>
            <Field label="Role *">
              <Select
                value={form.role}
                onChange={(e) => setField('role', e.target.value as StaffRole)}
                disabled={isEdit && !allowRoleChange}
                title={isEdit && !allowRoleChange ? 'Only admins can change a user’s role.' : undefined}
              >
                <option value="teacher">Teacher</option>
                <option value="staff">Staff (non-teaching)</option>
              </Select>
            </Field>
            <Field label="Designation">
              <TextInput
                value={form.designation}
                onChange={(e) => setField('designation', e.target.value)}
                placeholder="e.g. Senior Mathematics Faculty"
              />
            </Field>
            <Field label="Department">
              <TextInput
                value={form.department}
                onChange={(e) => setField('department', e.target.value)}
                placeholder="e.g. Mathematics, Accounts, Office"
              />
            </Field>
            <Field label="Qualification">
              <TextInput
                value={form.qualification}
                onChange={(e) => setField('qualification', e.target.value)}
                placeholder="e.g. M.Sc Mathematics"
              />
            </Field>
            <Field label="Salary (PKR)">
              <TextInput
                type="number"
                min="0"
                value={form.salary}
                onChange={(e) => setField('salary', e.target.value)}
                placeholder="e.g. 65000"
              />
            </Field>
            <Field label="Subjects (comma-separated)">
              <TextInput
                value={form.subjectsCsv}
                onChange={(e) => setField('subjectsCsv', e.target.value)}
                placeholder="e.g. Mathematics, Physics"
              />
            </Field>
            <Field label="Assigned classes (comma-separated)">
              <TextInput
                value={form.classesCsv}
                onChange={(e) => setField('classesCsv', e.target.value)}
                placeholder="e.g. 10-A, 9-B"
              />
            </Field>
            <Field label="Joining date">
              <TextInput
                type="date"
                value={form.joiningDate}
                onChange={(e) => setField('joiningDate', e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <GhostButton onClick={() => setModalOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add member'}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal
          title="Staff Detail"
          subtitle={`${viewing.name} · ${viewing.designation || viewing.role}`}
          onClose={() => setViewing(null)}
        >
          <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
            <Avatar src={viewing.photo} name={viewing.name} size={72} />
            <div className="min-w-0">
              <div className="text-lg font-extrabold text-slate-900 truncate">{viewing.name}</div>
              <div className="text-sm text-slate-500">
                {viewing.designation || '—'}{viewing.department ? ` · ${viewing.department}` : ''}
              </div>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <Badge tone={viewing.role === 'teacher' ? 'blue' : 'violet'}>
                  {viewing.role === 'teacher' ? 'Teacher' : 'Staff'}
                </Badge>
                <Badge tone={viewing.isActive ? 'green' : 'red'}>
                  {viewing.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 pt-4">
            <DetailRow label="Designation" value={viewing.designation} />
            <DetailRow label="Department" value={viewing.department} />
            <DetailRow label="Email" value={viewing.email} />
            <DetailRow label="Phone" value={viewing.phone} />
            <DetailRow label="Qualification" value={viewing.qualification} />
            <DetailRow
              label="Salary"
              value={viewing.salary ? formatPKR(viewing.salary) : undefined}
            />
            <DetailRow label="Joining Date" value={viewing.joiningDate} />
            <DetailRow label="Status" value={viewing.isActive ? 'Active' : 'Inactive'} />
            <div className="sm:col-span-2">
              <DetailRow label="Subjects" value={(viewing.subjects || []).join(', ')} />
            </div>
            <div className="sm:col-span-2">
              <DetailRow label="Assigned Classes" value={(viewing.assignedClasses || []).join(', ')} />
            </div>
          </div>
        </Modal>
      )}

      {dialog}
    </Card>
  );
};

const DetailRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div>
    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="text-sm font-semibold text-slate-800 mt-0.5 break-words">{value || '—'}</div>
  </div>
);

export default StaffManager;
