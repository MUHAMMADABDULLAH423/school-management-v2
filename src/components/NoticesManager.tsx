import React, { useMemo, useState } from 'react';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { NotificationItem, UserProfile, UserRole, todayStr } from '../types';
import {
  Badge, Card, CardHeader, EmptyState, Field, GhostButton, PrimaryButton,
  Select, Spinner, TextArea, TextInput, useConfirm,
} from './ui';

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'NOTICES',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

export function noticeVisibleTo(n: NotificationItem, uid: string, role: UserRole): boolean {
  if (n.audience === 'all') return true;
  if (n.audience === 'role') return n.toRole === role;
  if (n.audience === 'user') return n.toUserId === uid;
  return false;
}

const audienceLabel = (n: NotificationItem) =>
  n.audience === 'all' ? 'Everyone' : n.audience === 'role' ? `Role: ${n.toRole}` : 'Individual';

/**
 * Notices — admin creates/deletes; everyone sees filtered list.
 */
export const NoticesManager: React.FC = () => {
  const { currentUser } = useAuth();
  const role = currentUser?.role;
  const isAdmin = role === 'admin';
  const { data: notices, loading } = useCollection<NotificationItem>('notifications');
  const { data: users } = useCollection<UserProfile>('users');
  const { ask, dialog } = useConfirm();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'role' | 'user'>('all');
  const [toRole, setToRole] = useState<UserRole>('teacher');
  const [toUserId, setToUserId] = useState('');
  const [msg, setMsg] = useState('');

  const visible = useMemo(() => {
    if (!currentUser) return [];
    return notices
      .filter((n) => noticeVisibleTo(n, currentUser.uid, role as UserRole))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [notices, currentUser, role]);

  const create = async () => {
    if (!currentUser || !title.trim() || !body.trim()) return;
    setMsg('');
    try {
      await addDoc(collection(db, 'notifications'), {
        title: title.trim(), body: body.trim(), audience,
        toRole: audience === 'role' ? toRole : null,
        toUserId: audience === 'user' ? toUserId : null,
        date: todayStr(), createdBy: currentUser.name,
      });
      await logAudit(currentUser.uid, currentUser.name, 'Published notice',
        `"${title.trim()}" → ${audienceLabel({ audience, toRole, toUserId } as NotificationItem)}`);
      setTitle('');
      setBody('');
      setAudience('all');
      setMsg('Notice published.');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to publish.');
    }
  };

  const remove = (n: NotificationItem) => {
    if (!currentUser) return;
    ask({
      title: 'Delete notice',
      message: `Delete "${n.title}"?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'notifications', n.id));
          await logAudit(currentUser.uid, currentUser.name, 'Deleted notice', `"${n.title}"`);
        } catch (e: any) { setMsg(e?.message || 'Failed to delete.'); }
      },
    });
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Notices"
        subtitle="Announcements from the school office."
        pill={`${visible.length}`}
      />
      <div className="p-5">
        {isAdmin && (
          <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-bold text-slate-800">New notice</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Title">
                <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parent-Teacher Meeting" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Audience">
                  <Select value={audience} onChange={(e) => setAudience(e.target.value as any)}>
                    <option value="all">Everyone</option>
                    <option value="role">A role</option>
                    <option value="user">One person</option>
                  </Select>
                </Field>
                {audience === 'role' && (
                  <Field label="Role">
                    <Select value={toRole} onChange={(e) => setToRole(e.target.value as UserRole)}>
                      <option value="principal">Principal</option>
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="staff">Staff</option>
                      <option value="parent">Parent</option>
                    </Select>
                  </Field>
                )}
                {audience === 'user' && (
                  <Field label="Person">
                    <Select value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
                      <option value="">— Select —</option>
                      {users.filter((u) => u.isActive).map((u) => (
                        <option key={u.uid} value={u.uid}>{u.name} ({u.role})</option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            </div>
            <Field label="Message" className="mb-3">
              <TextArea rows={3} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Write the announcement…" />
            </Field>
            {msg && <div className="mb-3 text-sm text-emerald-700">{msg}</div>}
            <PrimaryButton type="button" onClick={create}
              disabled={!title.trim() || !body.trim() || (audience === 'user' && !toUserId)}>
              <Plus className="w-4 h-4" /> Publish
            </PrimaryButton>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState title="No notices" hint="Published notices will appear here." />
        ) : (
          <div className="space-y-3">
            {visible.map((n) => (
              <div key={n.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-900">{n.title}</span>
                      <Badge tone="blue">{audienceLabel(n)}</Badge>
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.body}</p>
                    <div className="mt-1.5 text-[11px] text-slate-400">
                      {n.date} · by {n.createdBy}
                    </div>
                  </div>
                  {isAdmin && (
                    <GhostButton type="button" onClick={() => remove(n)} className="!px-2.5 !py-1.5 text-rose-600 hover:!bg-rose-50">
                      <Trash2 className="w-4 h-4" />
                    </GhostButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {dialog}
    </Card>
  );
};
