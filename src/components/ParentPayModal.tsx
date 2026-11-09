import React, { useMemo, useRef, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { CheckCircle2, Upload, Wallet, X } from 'lucide-react';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import {
  FeeVoucher, PaymentMethod, SchoolProfile, Student, formatPKR,
} from '../types';
import { fileToDownscaledDataUrl } from '../utils/image';
import { Field, GhostButton, Modal, PrimaryButton, Select, TextInput } from './ui';

interface PayOption {
  method: PaymentMethod;
  label: string;
  detail: string;
}

/** Payment options from the school profile: Easypaisa / JazzCash (if set)
 *  plus every bank account. Empty when the school hasn't set any up. */
export const payOptionsFor = (school: SchoolProfile | null): PayOption[] => {
  if (!school) return [];
  const opts: PayOption[] = [];
  const ep = (school.easypaisa?.accountNumber || '').trim();
  if (ep) {
    opts.push({
      method: 'easypaisa',
      label: 'Easypaisa',
      detail: `${(school.easypaisa?.accountTitle || '').trim() || '—'} — ${ep}`,
    });
  }
  const jc = (school.jazzcash?.accountNumber || '').trim();
  if (jc) {
    opts.push({
      method: 'jazzcash',
      label: 'JazzCash',
      detail: `${(school.jazzcash?.accountTitle || '').trim() || '—'} — ${jc}`,
    });
  }
  (school.bankAccounts || []).forEach((b) => {
    opts.push({
      method: 'bank',
      label: b.bankName,
      detail: `A/C ${b.accountTitle}: ${b.accountNumber}`,
    });
  });
  return opts;
};

/**
 * Parent pays a pending voucher online: picks the school account, pays from
 * their own Easypaisa/JazzCash/bank app, then submits the transaction ID +
 * amount + receipt screenshot as proof. Submitting only CREATES a claim —
 * the fee is marked Paid only when an admin approves it (after checking
 * their own statement), so a fake claim can never pay a fee by itself.
 */
export const ParentPayModal: React.FC<{
  voucher: FeeVoucher;
  student: Student;
  school: SchoolProfile | null;
  onClose: () => void;
}> = ({ voucher, student, school, onClose }) => {
  const { currentUser } = useAuth();
  const options = useMemo(() => payOptionsFor(school), [school]);

  const [optIdx, setOptIdx] = useState(0);
  const [amount, setAmount] = useState(String(voucher.dueAmount || 0));
  const [txnId, setTxnId] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [shotBusy, setShotBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const shotInputRef = useRef<HTMLInputElement>(null);

  const selected = options[optIdx];
  const due = voucher.dueAmount || 0;

  const handleShot = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Screenshot must be an image file (JPG/PNG).');
      return;
    }
    setShotBusy(true);
    setError('');
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setScreenshot(dataUrl);
    } catch (e: any) {
      setError(e?.message || 'Could not read the screenshot.');
    } finally {
      setShotBusy(false);
    }
  };

  const submit = async () => {
    if (!currentUser || !selected) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError('Enter a valid amount.');
    if (amt > due + 0.01) return setError(`Amount cannot exceed due ${formatPKR(due)}.`);
    if (!txnId.trim()) return setError('Transaction ID is required — it is your proof of payment.');
    if (!screenshot) return setError('Please upload the payment receipt screenshot.');
    setBusy(true);
    setError('');
    try {
      await addDoc(collection(db, 'paymentClaims'), {
        studentId: voucher.studentId,
        feeId: voucher.id,
        month: voucher.month,
        amount: amt,
        method: selected.method,
        methodLabel: `${selected.label} — ${selected.detail}`,
        txnId: txnId.trim(),
        screenshot,
        status: 'pending',
        submittedBy: currentUser.name,
        submittedAt: new Date().toISOString(),
      });
      setDone(true);
    } catch (e: any) {
      const msg = String(e?.message || '');
      setError(
        msg.toLowerCase().includes('permission')
          ? 'Abhi submit nahi ho saka — school ke rules update ho rahe hain. Thodi der baad dobara try karein ya office se rabta karein.'
          : msg || 'Failed to submit. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Pay fee — ${student.name}`}
      subtitle={`${voucher.voucherNumber} · ${voucher.month} · Due ${formatPKR(due)}`}
      onClose={onClose}
    >
      {done ? (
        <div className="text-center py-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <p className="font-bold text-slate-900">Payment submitted for review</p>
          <p className="text-sm text-slate-600 mt-1">
            Admin aapki payment apne statement se check karke approve karega — approve hote hi
            fee Paid ho jayegi aur aapko notice mil jayega. Screenshot aur transaction ID record
            mein save ho gaye hain.
          </p>
          <div className="flex justify-center mt-5">
            <PrimaryButton onClick={onClose}>Done</PrimaryButton>
          </div>
        </div>
      ) : options.length === 0 ? (
        <div className="py-4">
          <p className="text-sm text-slate-700">
            School ne online payment ke accounts abhi set nahi kiye hain. Fee cash counter par
            jama karwayein ya office se rabta karein.
          </p>
          <div className="flex justify-end mt-5">
            <GhostButton onClick={onClose}>Close</GhostButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-900">
            <b>Step 1:</b> neeche diye gaye account par apne Easypaisa / JazzCash / bank app se
            payment karein. <b>Step 2:</b> transaction ID aur receipt screenshot yahan submit karein.
          </div>

          <Field label="Pay to *">
            <Select value={String(optIdx)} onChange={(e) => setOptIdx(Number(e.target.value))}>
              {options.map((o, i) => (
                <option key={`${o.method}-${i}`} value={String(i)}>
                  {o.label} — {o.detail}
                </option>
              ))}
            </Select>
          </Field>
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Wallet className="w-4 h-4 text-indigo-600" /> {selected.label}
              </div>
              <div className="text-slate-700 mt-0.5 font-mono">{selected.detail}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={`Amount (PKR) — due ${formatPKR(due)} *`}>
              <TextInput
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 5000"
              />
            </Field>
            <Field label="Transaction ID *">
              <TextInput
                value={txnId}
                onChange={(e) => setTxnId(e.target.value)}
                placeholder="e.g. 84739201"
                className="font-mono"
              />
            </Field>
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-1">Payment receipt screenshot *</span>
            <div className="flex items-start gap-3">
              {screenshot ? (
                <div className="relative shrink-0">
                  <img
                    src={screenshot}
                    alt="Payment receipt"
                    className="w-24 h-24 object-cover rounded-xl border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshot('')}
                    className="absolute -top-2 -right-2 p-1 rounded-full bg-rose-600 text-white shadow"
                    title="Remove screenshot"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={shotBusy}
                  onClick={() => shotInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {shotBusy ? 'Processing…' : 'Upload screenshot'}
                </button>
              )}
              <span className="text-[11px] text-slate-400 pt-1">
                Payment ki receipt ka screenshot lazmi hai — yehi aapka saboot hai. JPG/PNG, auto-resized.
              </span>
            </div>
            <input
              ref={shotInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleShot(e.target.files?.[0])}
            />
          </div>

          {error && (
            <div className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={submit} disabled={busy || shotBusy}>
              {busy ? 'Submitting…' : 'Submit payment proof'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Modal>
  );
};
