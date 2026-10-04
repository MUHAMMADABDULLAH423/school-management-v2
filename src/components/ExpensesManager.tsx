import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { ExpenseRecord, formatPKR, monthStr, todayStr } from '../types';
import {
  Card, CardHeader, EmptyState, Field, GhostButton, Modal, PrimaryButton,
  Select, Spinner, StatCard, Table, TextInput, useConfirm,
} from './ui';

const CATEGORIES = ['Salaries', 'Utilities', 'Maintenance', 'Supplies', 'Transport', 'Events', 'Misc'];

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'EXPENSES',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * Operational expenses — admin CRUD + monthly total.
 */
export const ExpensesManager: React.FC = () => {
  const { currentUser } = useAuth();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'principal';
  const { data: expenses, loading } = useCollection<ExpenseRecord>('expenses');
  const { ask, dialog } = useConfirm();

  const [month, setMonth] = useState(monthStr());
  const [modal, setModal] = useState<{ id: string | null; title: string; amount: string; category: string; date: string } | null>(null);
  const [msg, setMsg] = useState('');

  const filtered = useMemo(
    () => expenses.filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, month]
  );
  const monthTotal = useMemo(() => filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0), [filtered]);

  const openAdd = () => setModal({ id: null, title: '', amount: '', category: CATEGORIES[0], date: todayStr() });
  const openEdit = (e: ExpenseRecord) => setModal({
    id: e.id, title: e.title, amount: String(e.amount), category: e.category, date: e.date,
  });

  const save = async () => {
    if (!currentUser || !modal || !modal.title.trim() || !(Number(modal.amount) > 0)) return;
    setMsg('');
    try {
      const payload = {
        title: modal.title.trim(), amount: Number(modal.amount),
        category: modal.category, date: modal.date, addedBy: currentUser.name,
      };
      if (modal.id) {
        await setDoc(doc(db, 'expenses', modal.id), payload, { merge: true });
        await logAudit(currentUser.uid, currentUser.name, 'Updated expense', `${payload.title} — ${formatPKR(payload.amount)}`);
      } else {
        await addDoc(collection(db, 'expenses'), payload);
        await logAudit(currentUser.uid, currentUser.name, 'Added expense', `${payload.title} — ${formatPKR(payload.amount)} (${payload.date})`);
      }
      setModal(null);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    }
  };

  const remove = (e: ExpenseRecord) => {
    if (!currentUser) return;
    ask({
      title: 'Delete expense',
      message: `Delete "${e.title}" (${formatPKR(e.amount)})?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'expenses', e.id));
          await logAudit(currentUser.uid, currentUser.name, 'Deleted expense', `${e.title} — ${formatPKR(e.amount)}`);
        } catch (err: any) { setMsg(err?.message || 'Failed to delete.'); }
      },
    });
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Operational Expenses"
        subtitle="Track non-salary spending."
        action={
          <div className="flex items-center gap-2">
            <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            {canManage && (
              <PrimaryButton type="button" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add
              </PrimaryButton>
            )}
          </div>
        }
      />
      <div className="p-5">
        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">{msg}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <StatCard label="Month Total" value={formatPKR(monthTotal)} sub={`${filtered.length} entries`}
            icon={<Wallet className="w-5 h-5" />} tone="rose" />
          <StatCard label="Entries" value={String(filtered.length)} sub={`for ${month}`}
            icon={<Receipt className="w-5 h-5" />} tone="amber" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No expenses this month" />
        ) : (
          <Table head={['Title', 'Category', 'Date', 'Amount', ...(canManage ? ['Actions'] : [])]}>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{e.title}</td>
                <td className="px-3 py-2 text-slate-600">{e.category}</td>
                <td className="px-3 py-2 text-slate-600">{e.date}</td>
                <td className="px-3 py-2 font-bold text-slate-900">{formatPKR(e.amount)}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <GhostButton type="button" onClick={() => openEdit(e)} className="!px-2.5 !py-1.5">
                        <Pencil className="w-4 h-4" />
                      </GhostButton>
                      <GhostButton type="button" onClick={() => remove(e)} className="!px-2.5 !py-1.5 text-rose-600 hover:!bg-rose-50">
                        <Trash2 className="w-4 h-4" />
                      </GhostButton>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </div>

      {modal && (
        <Modal title={modal.id ? 'Edit Expense' : 'Add Expense'} onClose={() => setModal(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Title" className="sm:col-span-2">
              <TextInput value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} placeholder="e.g. Electricity bill" />
            </Field>
            <Field label="Amount (PKR)">
              <TextInput type="number" min={1} value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Date">
              <TextInput type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton type="button" onClick={() => setModal(null)}>Cancel</GhostButton>
            <PrimaryButton type="button" onClick={save} disabled={!modal.title.trim() || !(Number(modal.amount) > 0)}>
              Save
            </PrimaryButton>
          </div>
        </Modal>
      )}
      {dialog}
    </Card>
  );
};
