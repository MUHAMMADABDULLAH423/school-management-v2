import React, { useMemo, useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { HolidayItem, todayStr } from '../types';
import {
  Card, CardHeader, EmptyState, Field, GhostButton, Modal, PrimaryButton,
  Spinner, TextArea, TextInput, useConfirm,
} from './ui';

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'HOLIDAYS',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * School holidays — admin CRUD, everyone can view.
 */
export const HolidaysManager: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const { data: holidays, loading } = useCollection<HolidayItem>('holidays');
  const { ask, dialog } = useConfirm();

  const [modal, setModal] = useState<{ id: string | null; name: string; date: string; description: string } | null>(null);
  const [msg, setMsg] = useState('');

  const sorted = useMemo(
    () => holidays.slice().sort((a, b) => a.date.localeCompare(b.date)),
    [holidays]
  );

  const openAdd = () => setModal({ id: null, name: '', date: todayStr(), description: '' });
  const openEdit = (h: HolidayItem) => setModal({ id: h.id, name: h.name, date: h.date, description: h.description || '' });

  const save = async () => {
    if (!currentUser || !modal || !modal.name.trim() || !modal.date) return;
    setMsg('');
    try {
      const payload = { name: modal.name.trim(), date: modal.date, description: modal.description.trim() };
      if (modal.id) {
        await setDoc(doc(db, 'holidays', modal.id), payload, { merge: true });
        await logAudit(currentUser.uid, currentUser.name, 'Updated holiday', `${payload.name} (${payload.date})`);
      } else {
        await addDoc(collection(db, 'holidays'), payload);
        await logAudit(currentUser.uid, currentUser.name, 'Added holiday', `${payload.name} (${payload.date})`);
      }
      setModal(null);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    }
  };

  const remove = (h: HolidayItem) => {
    if (!currentUser) return;
    ask({
      title: 'Delete holiday',
      message: `Remove "${h.name}" (${h.date})?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'holidays', h.id));
          await logAudit(currentUser.uid, currentUser.name, 'Deleted holiday', `${h.name} (${h.date})`);
        } catch (e: any) { setMsg(e?.message || 'Failed to delete.'); }
      },
    });
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Holidays & Calendar"
        subtitle="School holidays for the academic year."
        pill={`${sorted.length}`}
        action={isAdmin ? (
          <PrimaryButton type="button" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Holiday
          </PrimaryButton>
        ) : undefined}
      />
      <div className="p-5">
        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{msg}</div>
        )}
        {sorted.length === 0 ? (
          <EmptyState title="No holidays added" />
        ) : (
          <div className="space-y-2">
            {sorted.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-white">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-900">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.date}{h.description ? ` · ${h.description}` : ''}</div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1.5">
                    <GhostButton type="button" onClick={() => openEdit(h)} className="!px-2.5 !py-1.5">
                      <Pencil className="w-4 h-4" />
                    </GhostButton>
                    <GhostButton type="button" onClick={() => remove(h)} className="!px-2.5 !py-1.5 text-rose-600 hover:!bg-rose-50">
                      <Trash2 className="w-4 h-4" />
                    </GhostButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          title={modal.id ? 'Edit Holiday' : 'Add Holiday'}
          onClose={() => setModal(null)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Field label="Holiday name">
              <TextInput value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="e.g. Eid-ul-Fitr" />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <TextArea rows={2} value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} />
          </Field>
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton type="button" onClick={() => setModal(null)}>Cancel</GhostButton>
            <PrimaryButton type="button" onClick={save} disabled={!modal.name.trim() || !modal.date}>
              Save
            </PrimaryButton>
          </div>
        </Modal>
      )}
      {dialog}
    </Card>
  );
};
