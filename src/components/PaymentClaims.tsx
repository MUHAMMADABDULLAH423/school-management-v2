import React, { useMemo, useState } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { Check, Receipt, X } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import {
  FeeStatus, FeeVoucher, PaymentClaim, PaymentClaimStatus, Student,
  formatPKR, monthStr, todayStr,
} from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Field, GhostButton, Modal,
  PrimaryButton, Spinner, Table, TextInput,
} from './ui';

const claimTone = (s: PaymentClaimStatus): 'amber' | 'green' | 'red' =>
  s === 'pending' ? 'amber' : s === 'approved' ? 'green' : 'red';

async function auditLog(userId: string, userName: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId, userName, action, category: 'FEES',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break the UI */ }
}

export async function notifyParent(parentId: string | undefined, by: string, title: string, body: string) {
  if (!parentId) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      title, body, audience: 'user', toUserId: parentId,
      date: todayStr(), createdBy: by,
    });
  } catch { /* notification failure must not block the review */ }
}

/**
 * Online fee-payment claims (admin review queue, inside the Fee Center).
 * A parent pays via Easypaisa/JazzCash/bank and submits txn ID + receipt
 * screenshot. The admin checks the claim against their own statement and:
 *  - Approve: the voucher is paid exactly like a counter collection
 *    (paidAmount/dueAmount/status/receipt/channel) + the student's fee
 *    status is recomputed + the parent is notified.
 *  - Reject: claim closed with a note + the parent is notified.
 * A claim can never mark a fee paid by itself — only the admin's Approve does.
 */
export const PaymentClaims: React.FC = () => {
  const { currentUser } = useAuth();
  const { data: claims, loading: loadingClaims } = useCollection<PaymentClaim>('paymentClaims');
  const { data: students } = useCollection<Student>('students');
  const { data: fees } = useCollection<FeeVoucher>('fees');

  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState('');
  const [msgIsError, setMsgIsError] = useState(false);
  const [preview, setPreview] = useState<PaymentClaim | null>(null);
  const [rejectFor, setRejectFor] = useState<PaymentClaim | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const studentsById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const feesById = useMemo(() => new Map(fees.map((f) => [f.id, f])), [fees]);

  const pendingCount = useMemo(() => claims.filter((c) => c.status === 'pending').length, [claims]);

  const visible = useMemo(() => {
    const list = claims.filter((c) => filter === 'all' || c.status === filter);
    return list.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }, [claims, filter]);

  const approve = async (claim: PaymentClaim) => {
    if (!currentUser || busyId) return;
    const voucher = feesById.get(claim.feeId);
    if (!voucher) {
      setMsgIsError(true);
      setMsg('Voucher not found — it may have been deleted. Reject the claim instead.');
      return;
    }
    if (voucher.status === 'Paid' || (voucher.dueAmount || 0) <= 0) {
      setMsgIsError(true);
      setMsg(`${voucher.voucherNumber} is already Paid — nothing left to approve.`);
      return;
    }
    setBusyId(claim.id);
    setMsg('');
    try {
      // Same maths as the counter collection in FeesManager.
      const amount = Math.min(claim.amount, voucher.dueAmount || 0);
      const newPaid = (voucher.paidAmount || 0) + amount;
      const newDue = Math.max(0, (voucher.totalAmount || 0) - newPaid);
      const status: FeeStatus = newDue <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Pending';
      const receiptNo = voucher.receiptNo || `RCPT-${Date.now().toString().slice(-8)}`;
      await updateDoc(doc(db, 'fees', voucher.id), {
        paidAmount: newPaid, dueAmount: newDue, status,
        paidDate: todayStr(), receiptNo,
        paymentChannel: claim.method,
        paymentBank: claim.methodLabel,
      });

      // Recompute the student's fee status across ALL their vouchers.
      const sv = fees.filter((f) => f.studentId === voucher.studentId).map((f) =>
        f.id === voucher.id ? { ...f, paidAmount: newPaid, dueAmount: newDue } : f
      );
      const totalDue = sv.reduce((t, f) => t + (f.dueAmount || 0), 0);
      const totalPaid = sv.reduce((t, f) => t + (f.paidAmount || 0), 0);
      const oldDue = sv.some((f) => f.month < monthStr() && (f.dueAmount || 0) > 0);
      const feeStatus: FeeStatus =
        totalDue <= 0 && !oldDue ? 'Paid'
        : oldDue ? 'Defaulter'
        : totalPaid > 0 ? 'Partial'
        : 'Pending';
      const st = studentsById.get(voucher.studentId);
      if (st) await updateDoc(doc(db, 'students', st.id), { feeStatus });

      await updateDoc(doc(db, 'paymentClaims', claim.id), {
        status: 'approved', reviewedBy: currentUser.name, reviewedAt: new Date().toISOString(),
      });
      await auditLog(currentUser.uid, currentUser.name, 'Online fee payment approved',
        `Approved ${formatPKR(amount)} for ${voucher.voucherNumber} (${st?.name || ''}) via ${claim.methodLabel}; txn ${claim.txnId}; receipt ${receiptNo}`);
      await notifyParent(st?.parentId, currentUser.name, 'Fee payment approved',
        `${formatPKR(amount)} received for ${st?.name || 'your child'} (${voucher.month}) via ${claim.methodLabel}. Receipt ${receiptNo}.`);
      setMsgIsError(false);
      setMsg(`Approved — ${voucher.voucherNumber} updated (${formatPKR(amount)}). Parent notified.`);
    } catch (e: any) {
      setMsgIsError(true);
      setMsg(e?.message || 'Approval failed. Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const reject = async () => {
    if (!currentUser || !rejectFor || busyId) return;
    const claim = rejectFor;
    const st = studentsById.get(claim.studentId);
    const note = rejectNote.trim();
    setBusyId(claim.id);
    try {
      await updateDoc(doc(db, 'paymentClaims', claim.id), {
        status: 'rejected', reviewedBy: currentUser.name,
        reviewedAt: new Date().toISOString(), reviewNote: note,
      });
      await auditLog(currentUser.uid, currentUser.name, 'Online fee payment rejected',
        `Rejected ${formatPKR(claim.amount)} for ${claim.feeId} (${st?.name || ''}); txn ${claim.txnId}${note ? ` — ${note}` : ''}`);
      await notifyParent(st?.parentId, currentUser.name, 'Fee payment not approved',
        `Your online payment of ${formatPKR(claim.amount)} for ${st?.name || 'your child'} (${claim.month}) could not be verified${note ? `: ${note}` : ''}. Please check the transaction and resubmit, or pay at the school counter.`);
      setMsgIsError(false);
      setMsg('Claim rejected. Parent notified.');
      setRejectFor(null);
      setRejectNote('');
    } catch (e: any) {
      setMsgIsError(true);
      setMsg(e?.message || 'Rejection failed. Please try again.');
    } finally {
      setBusyId('');
    }
  };

  if (loadingClaims) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Online Payment Claims"
        subtitle="Parents pay via Easypaisa / JazzCash / bank and submit proof here. Verify against your statement, then approve — approving marks the fee Paid."
        pill={pendingCount > 0 ? `${pendingCount} pending` : 'No pending claims'}
      />
      <div className="p-5">
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                filter === f
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              {f === 'pending' ? `Pending (${pendingCount})` : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {msg && (
          <div className={`mb-4 px-3 py-2 rounded-lg text-sm border ${msgIsError
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {msg}
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState
            title={filter === 'pending' ? 'No pending claims' : 'No claims here yet'}
            hint="Claims appear here once a parent submits an online payment."
          />
        ) : (
          <Table head={['Student', 'Voucher', 'Amount', 'Method', 'Txn ID', 'Proof', 'Status', '']}>
            {visible.map((c) => {
              const st = studentsById.get(c.studentId);
              const v = feesById.get(c.feeId);
              return (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={st?.photo} name={st?.name || c.submittedBy} size={32} />
                      <div>
                        <div className="font-semibold text-slate-900">{st?.name || '—'}</div>
                        <div className="text-[11px] text-slate-500">
                          {c.submittedBy} · {c.submittedAt.slice(0, 10)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{v?.voucherNumber || '—'}</div>
                    <div className="text-[11px] text-slate-500">{c.month}</div>
                  </td>
                  <td className="px-3 py-2 font-bold text-slate-900">{formatPKR(c.amount)}</td>
                  <td className="px-3 py-2 text-slate-700 text-xs">{c.methodLabel}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{c.txnId}</td>
                  <td className="px-3 py-2">
                    {c.screenshot ? (
                      <button type="button" onClick={() => setPreview(c)} title="View receipt screenshot">
                        <img
                          src={c.screenshot}
                          alt="Receipt"
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200 hover:border-indigo-400"
                        />
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">No screenshot</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={claimTone(c.status)}>{c.status}</Badge>
                    {c.status !== 'pending' && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {c.reviewedBy || ''}{c.reviewNote ? ` — ${c.reviewNote}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {c.status === 'pending' && (
                      <div className="flex gap-1.5">
                        <PrimaryButton
                          type="button"
                          onClick={() => approve(c)}
                          disabled={busyId === c.id}
                          className="!px-3 !py-1.5 text-xs"
                        >
                          <Check className="w-3.5 h-3.5" /> {busyId === c.id ? 'Working…' : 'Approve'}
                        </PrimaryButton>
                        <GhostButton
                          type="button"
                          onClick={() => { setRejectFor(c); setRejectNote(''); }}
                          disabled={busyId === c.id}
                          className="!px-3 !py-1.5 text-xs"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </GhostButton>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      {preview?.screenshot && (
        <Modal
          title="Payment receipt"
          subtitle={`${preview.methodLabel} · Txn ${preview.txnId} · ${formatPKR(preview.amount)}`}
          onClose={() => setPreview(null)}
        >
          <img src={preview.screenshot} alt="Payment receipt" className="w-full rounded-xl border border-slate-200" />
        </Modal>
      )}

      {rejectFor && (
        <Modal
          title="Reject payment claim"
          subtitle={`${formatPKR(rejectFor.amount)} · ${rejectFor.methodLabel} · Txn ${rejectFor.txnId}`}
          onClose={() => setRejectFor(null)}
        >
          <Field label="Reason for the parent (optional)">
            <TextInput
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Transaction not found in our statement — please check the Txn ID and resubmit."
            />
          </Field>
          <p className="mt-2 text-xs text-slate-500">
            The fee stays unpaid. The parent gets a notice with this reason and can resubmit or pay at the counter.
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <GhostButton onClick={() => setRejectFor(null)}>Cancel</GhostButton>
            <PrimaryButton onClick={reject} disabled={busyId === rejectFor.id}>
              <Receipt className="w-4 h-4" /> {busyId === rejectFor.id ? 'Rejecting…' : 'Reject claim'}
            </PrimaryButton>
          </div>
        </Modal>
      )}
    </Card>
  );
};
