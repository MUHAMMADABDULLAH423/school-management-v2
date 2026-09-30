/**
 * UserManager — user account management (login profiles).
 *
 * Lives in the PRINCIPAL portal (moved from admin). Guarded by the role check
 * at the dashboard level AND by firestore.rules (users: create/list/update/delete
 * require admin or principal).
 *
 * IMPORTANT: this manages Firestore user PROFILE docs only. The Firebase Auth
 * login (email/password) must be created in the Firebase Console
 * (Authentication → Users). The app auto-links: on first login the AuthContext
 * adopts a users doc that matches by email and re-keys it to the Auth uid.
 */
import React, { useMemo, useState } from 'react';
import {
  addDoc, collection, doc, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { UserPlus, KeyRound, Power, PowerOff, Trash2, Info } from 'lucide-react';
import { db } from '../config/firebase';
import { useCollection } from '../hooks/useFirestore';
import { useAuth } from '../context/AuthContext';
import { UserProfile, UserRole, pendingUserDocId } from '../types';
import {
  Card, CardHeader, Modal, Field, TextInput, Select, PrimaryButton, GhostButton,
  Badge, Avatar, SearchInput, Table, EmptyState, Spinner, useConfirm,
} from './ui';

type UserDoc = UserProfile & { id: string; parentId?: string };

const ROLES: UserRole[] = ['principal', 'admin', 'teacher', 'staff', 'parent'];

const roleTone = (r: UserRole): 'violet' | 'blue' | 'green' | 'amber' | 'slate' =>
  r === 'principal' ? 'violet' : r === 'admin' ? 'blue' : r === 'teacher' ? 'green' : r === 'staff' ? 'amber' : 'slate';

async function auditLog(userId: string, userName: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId, userName, action, category: 'USERS', details,
      timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break the app */ }
}

const UserManager: React.FC = () => {
  const { data: raw, loading } = useCollection<UserDoc>('users');
  const { currentUser } = useAuth();
  const { ask, dialog } = useConfirm();

  // Normalize: docs are keyed by Auth uid on login, but docs created here
  // (before Auth exists) are keyed by auto-id — uid may live in the data.
  const users = useMemo(
    () => raw.map((u) => ({ ...u, uid: (u.uid || u.id) as string })),
    [raw]
  );

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [phone, setPhone] = useState('');
  const [staffId, setStaffId] = useState('');
  const [parentId, setParentId] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === 'all' ? true : u.role === roleFilter))
      .filter((u) =>
        !q ? true : [u.name, u.email, u.role].some((v) => (v || '').toLowerCase().includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, search, roleFilter]);

  const isSelf = (u: UserDoc) => currentUser != null && u.uid === currentUser.uid;

  const openAdd = () => {
    setName(''); setEmail(''); setRole('teacher'); setPhone(''); setStaffId(''); setParentId('');
    setError('');
    setModalOpen(true);
  };

  const addUser = async () => {
    if (!currentUser) return;
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
      setError('A user with this email already exists.');
      return;
    }
    setSaving(true);
    try {
      const emailKey = email.trim().toLowerCase();
      await setDoc(doc(db, 'users', pendingUserDocId(emailKey)), {
        uid: pendingUserDocId(emailKey),
        name: name.trim(),
        email: emailKey,
        role,
        phone: phone.trim(),
        schoolId: currentUser.schoolId || 'main',
        ...(staffId.trim() ? { staffId: staffId.trim() } : {}),
        ...(role === 'parent' && parentId.trim() ? { parentId: parentId.trim() } : {}),
        isActive: true,
        isFirstLogin: true,
        createdAt: new Date().toISOString(),
      });
      await auditLog(currentUser.uid, currentUser.name, 'User created',
        `Created ${role} account for ${name.trim()} (${email.trim()})`);
      setModalOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (u: UserDoc) => {
    if (!currentUser || isSelf(u)) return;
    const activate = !u.isActive;
    const verb = activate ? 'Reactivate' : 'Deactivate';
    if (!activate) {
      ask({
        title: `${verb} user`,
        message: `${verb} ${u.name} (${u.email})? They will no longer be able to log in.`,
        confirmLabel: verb,
        onConfirm: async () => {
          await updateDoc(doc(db, 'users', u.id), { isActive: false });
          await auditLog(currentUser.uid, currentUser.name, 'User deactivated',
            `Deactivated ${u.role} ${u.name} (${u.email})`);
        },
      });
    } else {
      updateDoc(doc(db, 'users', u.id), { isActive: true }).then(() =>
        auditLog(currentUser.uid, currentUser.name, 'User reactivated',
          `Reactivated ${u.role} ${u.name} (${u.email})`)
      );
    }
  };

  const resetPassword = (u: UserDoc) => {
    if (!currentUser || isSelf(u)) return;
    ask({
      title: 'Reset password',
      message: `Reset password for ${u.name}? They will be forced to set a new password on next login.`,
      confirmLabel: 'Reset',
      onConfirm: async () => {
        await updateDoc(doc(db, 'users', u.id), { isFirstLogin: true });
        await auditLog(currentUser.uid, currentUser.name, 'Password reset',
          `Forced password reset for ${u.role} ${u.name} (${u.email})`);
        setResetNote(u.email);
      },
    });
  };

  const deleteUser = (u: UserDoc) => {
    if (!currentUser || isSelf(u)) return;
    ask({
      title: 'Delete user',
      message: `Permanently delete ${u.name} (${u.email}, ${u.role})? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'users', u.id));
        await auditLog(currentUser.uid, currentUser.name, 'User deleted',
          `Deleted ${u.role} ${u.name} (${u.email})`);
      },
    });
  };

  return (
    <div>
      <Card>
        <CardHeader
          title="User Accounts"
          subtitle={`${filtered.length} of ${users.length} users`}
          action={
            <PrimaryButton onClick={openAdd}>
              <UserPlus className="w-4 h-4" /> Add User
            </PrimaryButton>
          }
        />
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, email…" />
          </div>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="sm:w-44">
            <option value="all">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </div>
        {resetNote && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 flex gap-2 text-sm text-amber-900">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              Password reset for <b>{resetNote}</b> — they must set a new password on next login
              (isFirstLogin). Remember: the Auth login itself lives in the Firebase Console →
              Authentication; the app auto-links it to this profile by email.
              <button type="button" onClick={() => setResetNote(null)} className="ml-2 underline font-semibold">
                Dismiss
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No users found" hint="Add the first user account." />
        ) : (
          <Table head={['User', 'Role', 'Active', 'First login', '']}>
            {filtered.map((u) => {
              const self = isSelf(u);
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={u.photoURL} name={u.name} size={36} />
                      <div>
                        <div className="font-semibold text-slate-900">
                          {u.name} {self && <span className="text-xs text-slate-400">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                        {(u.staffId || u.parentId) && (
                          <div className="text-[11px] text-slate-400">
                            {u.staffId ? `staff: ${u.staffId}` : `parent: ${u.parentId}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={roleTone(u.role)}>{u.role}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      disabled={self}
                      title={self ? 'You cannot deactivate your own account' : u.isActive ? 'Deactivate' : 'Reactivate'}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold disabled:opacity-40 ${
                        u.isActive
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {u.isActive ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                      {u.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {u.isFirstLogin ? <Badge tone="amber">Must set password</Badge> : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => resetPassword(u)}
                      disabled={self}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-amber-600 disabled:opacity-40"
                      title={self ? 'You cannot reset your own password here' : 'Reset password'}
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteUser(u)}
                      disabled={self}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40"
                      title={self ? 'You cannot delete your own account' : 'Delete user'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {modalOpen && (
        <Modal
          title="Add User"
          subtitle="Profile doc only — create the matching Auth login in Firebase Console (Authentication → Users); the app auto-links it by email on first login"
          onClose={() => setModalOpen(false)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name *">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fatima Khan" />
            </Field>
            <Field label="Email *">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@school.pk" />
            </Field>
            <Field label="Role *">
              <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xxxxxxxxx" />
            </Field>
            {(role === 'teacher' || role === 'staff') && (
              <Field label="Link staff record ID (optional)">
                <TextInput value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="staff doc id" />
              </Field>
            )}
            {role === 'parent' && (
              <Field label="Link parent ID (optional)">
                <TextInput value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder="optional — parent email on the student record also links automatically" />
              </Field>
            )}
          </div>
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
            <span>
              The new account starts with <b>isFirstLogin = true</b>, so it must set a password on
              first login. Create the Firebase Auth user in the Console with the same email — the
              app will link them automatically.
            </span>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton onClick={() => setModalOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={addUser} disabled={saving}>
              {saving ? 'Saving…' : 'Add User'}
            </PrimaryButton>
          </div>
        </Modal>
      )}
      {dialog}
    </div>
  );
};

export default UserManager;
