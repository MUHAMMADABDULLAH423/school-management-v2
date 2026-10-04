/**
 * FeesManager — fee voucher generation, payment collection, print.
 *
 * Props: readOnly (principal) → hides ALL write buttons (generate, collect).
 * Admin gets the full write UI. Permission also enforced in firestore.rules
 * (fees: write = admin only).
 */
import React, { useMemo, useState } from 'react';
import {
  addDoc, collection, doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import {
  Receipt, Plus, Eye, Wallet, Banknote, AlertCircle, CircleDollarSign, MessageCircle,
} from 'lucide-react';
import { db } from '../config/firebase';
import { useCollection, useSchool } from '../hooks/useFirestore';
import { useAuth } from '../context/AuthContext';
import { FeeVoucher, FeeStatus, Student, SchoolProfile, formatPKR, monthStr, todayStr } from '../types';
import {
  Card, CardHeader, Modal, Field, TextInput, PrimaryButton, GhostButton,
  Badge, SearchInput, Select, Table, EmptyState, Spinner, StatCard,
} from './ui';
import FeeVoucherPrint, { buildWaLink } from './FeeVoucherPrint';

const statusTone = (s: FeeStatus): 'green' | 'amber' | 'blue' | 'red' =>
  s === 'Paid' ? 'green' : s === 'Partial' ? 'amber' : s === 'Pending' ? 'blue' : 'red';

/** Bank line printed on vouchers — never hardcoded, always from school profile. */
export const bankLineFor = (school: SchoolProfile | null): string => {
  if (!school || !school.bankAccounts?.length) return '—';
  const d = school.bankAccounts.find((a) => a.isDefault) || school.bankAccounts[0];
  return `${d.bankName} — A/C ${d.accountTitle}: ${d.accountNumber}`;
};

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

async function auditLog(userId: string, userName: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId, userName, action, category: 'FEES', details,
      timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break the app */ }
}

const FeesManager: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const { data: fees, loading: feesLoading } = useCollection<FeeVoucher>('fees');
  const { data: students, loading: studentsLoading } = useCollection<Student>('students');
  const { school } = useSchool();
  const { currentUser } = useAuth();

  const [monthFilter, setMonthFilter] = useState(monthStr());
  const [search, setSearch] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [collectFor, setCollectFor] = useState<FeeVoucher | null>(null);
  const [printFor, setPrintFor] = useState<FeeVoucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Generate-voucher form state
  const [genMonth, setGenMonth] = useState(monthStr());
  const [tuitionFee, setTuitionFee] = useState('2500');
  const [transportFee, setTransportFee] = useState('0');
  const [examFee, setExamFee] = useState('0');
  const [dueDate, setDueDate] = useState(() => `${monthStr()}-10`);

  // Collect-payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayStr());
  /** 'cash' = cash on counter, otherwise a school bank account id */
  const [payChannel, setPayChannel] = useState('cash');

  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const monthFees = useMemo(
    () => fees.filter((f) => f.month === monthFilter).sort((a, b) => a.voucherNumber.localeCompare(b.voucherNumber)),
    [fees, monthFilter]
  );

  const filteredFees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return monthFees;
    return monthFees.filter((f) => {
      const s = studentsById.get(f.studentId);
      return [f.voucherNumber, s?.name, s?.rollNumber, f.status].some((v) =>
        (v || '').toLowerCase().includes(q)
      );
    });
  }, [monthFees, search, studentsById]);

  const collected = useMemo(
    () => monthFees.reduce((t, f) => t + (f.paidAmount || 0), 0),
    [monthFees]
  );
  const pending = useMemo(
    () => monthFees.reduce((t, f) => t + (f.dueAmount || 0), 0),
    [monthFees]
  );
  const defaulterCount = useMemo(
    () => students.filter((s) => s.isActive && s.feeStatus === 'Defaulter').length,
    [students]
  );

  const openCollect = (v: FeeVoucher) => {
    setCollectFor(v);
    setPayAmount(String(v.dueAmount || 0));
    setPayDate(todayStr());
    setPayChannel('cash');
    setError('');
  };

  const collectPayment = async () => {
    if (!collectFor || !currentUser) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (amount > (collectFor.dueAmount || 0) + 0.01) {
      setError(`Amount cannot exceed due ${formatPKR(collectFor.dueAmount)}.`);
      return;
    }
    setBusy(true);
    try {
      const newPaid = (collectFor.paidAmount || 0) + amount;
      const newDue = Math.max(0, (collectFor.totalAmount || 0) - newPaid);
      const status: FeeStatus = newDue <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Pending';
      const receiptNo = collectFor.receiptNo || `RCPT-${Date.now().toString().slice(-8)}`;
      const viaBank = payChannel !== 'cash';
      const bank = viaBank ? (school?.bankAccounts || []).find((b) => b.id === payChannel) : undefined;
      await updateDoc(doc(db, 'fees', collectFor.id), {
        paidAmount: newPaid, dueAmount: newDue, status,
        paidDate: payDate, receiptNo,
        paymentChannel: viaBank ? 'bank' : 'cash',
        paymentBank: bank ? `${bank.bankName} — ${bank.accountNumber}` : '',
      });

      // Recompute the student's fee status across ALL their vouchers
      const sv = fees.filter((f) => f.studentId === collectFor.studentId).map((f) =>
        f.id === collectFor.id ? { ...f, paidAmount: newPaid, dueAmount: newDue } : f
      );
      const totalDue = sv.reduce((t, f) => t + (f.dueAmount || 0), 0);
      const totalPaid = sv.reduce((t, f) => t + (f.paidAmount || 0), 0);
      const oldDue = sv.some((f) => f.month < monthStr() && (f.dueAmount || 0) > 0);
      const feeStatus: FeeStatus =
        totalDue <= 0 && !oldDue ? 'Paid'
        : oldDue ? 'Defaulter'
        : totalPaid > 0 ? 'Partial'
        : 'Pending';
      const st = studentsById.get(collectFor.studentId);
      if (st) await updateDoc(doc(db, 'students', st.id), { feeStatus });

      await auditLog(currentUser.uid, currentUser.name, 'Fee collected',
        `Collected ${formatPKR(amount)} against ${collectFor.voucherNumber} (${st?.name || ''}); receipt ${receiptNo}; via ${viaBank ? `bank${bank ? ` (${bank.bankName})` : ''}` : 'cash (counter)'}`);
      setCollectFor(null);
    } catch (e: any) {
      setError(e?.message || 'Payment failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const generateVouchers = async () => {
    if (!currentUser) return;
    const t = parseFloat(tuitionFee) || 0;
    const tr = parseFloat(transportFee) || 0;
    const ex = parseFloat(examFee) || 0;
    if (t + tr + ex <= 0) { setError('Set at least one fee head.'); return; }
    setBusy(true);
    setError('');
    try {
      const bankSnapshot = bankLineFor(school);
      const active = students.filter((s) => s.isActive);
      const existing = new Set(fees.filter((f) => f.month === genMonth).map((f) => f.studentId));
      const batch = writeBatch(db);
      let count = 0;
      const defaulterIds = new Set<string>();
      for (const s of active) {
        if (existing.has(s.id)) continue;
        const total = t + tr + ex;
        const voucherNumber = `VCH-${genMonth}-${sanitize(s.rollNumber) || s.id.slice(0, 6)}`;
        const ref = doc(collection(db, 'fees'));
        batch.set(ref, {
          studentId: s.id,
          voucherNumber,
          month: genMonth,
          tuitionFee: t, transportFee: tr, examFee: ex, lateFine: 0,
          totalAmount: total, paidAmount: 0, dueAmount: total,
          status: 'Pending',
          dueDate,
          bankSnapshot,
          createdAt: new Date().toISOString(),
        });
        count++;
        // Student owes from an older month → mark defaulter
        const oldDue = fees.some((f) => f.studentId === s.id && f.month < genMonth && (f.dueAmount || 0) > 0);
        if (oldDue) defaulterIds.add(s.id);
      }
      await batch.commit();
      for (const id of defaulterIds) {
        await updateDoc(doc(db, 'students', id), { feeStatus: 'Defaulter' });
      }
      await auditLog(currentUser.uid, currentUser.name, 'Vouchers generated',
        `Generated ${count} vouchers for ${genMonth} (tuition ${formatPKR(t)}, transport ${formatPKR(tr)}, exam ${formatPKR(ex)})`);
      setGenerateOpen(false);
      setMonthFilter(genMonth);
    } catch (e: any) {
      setError(e?.message || 'Generation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const printStudent = printFor ? studentsById.get(printFor.studentId) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`Collected — ${monthFilter}`}
          value={formatPKR(collected)}
          sub={`${monthFees.length} vouchers`}
          icon={<Banknote className="w-5 h-5" />}
          tone="emerald"
        />
        <StatCard
          label={`Pending — ${monthFilter}`}
          value={formatPKR(pending)}
          icon={<CircleDollarSign className="w-5 h-5" />}
          tone="amber"
        />
        <StatCard
          label="Defaulters"
          value={String(defaulterCount)}
          sub="active students"
          icon={<AlertCircle className="w-5 h-5" />}
          tone="rose"
        />
      </div>

      <Card>
        <CardHeader
          title={readOnly ? 'Fee Center (view only)' : 'Fee Center'}
          subtitle={`${filteredFees.length} vouchers for ${monthFilter}`}
          action={
            <div className="flex items-center gap-2">
              <TextInput
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-auto"
              />
              {!readOnly && (
                <PrimaryButton onClick={() => { setGenMonth(monthFilter); setDueDate(`${monthFilter}-10`); setError(''); setGenerateOpen(true); }}>
                  <Plus className="w-4 h-4" /> Generate Vouchers
                </PrimaryButton>
              )}
            </div>
          }
        />
        <div className="px-5 py-4 border-b border-slate-100">
          <SearchInput value={search} onChange={setSearch} placeholder="Search voucher, student, roll…" />
        </div>
        {feesLoading || studentsLoading ? (
          <Spinner />
        ) : filteredFees.length === 0 ? (
          <EmptyState title="No vouchers" hint={readOnly ? 'No vouchers for this month.' : 'Generate vouchers for this month to begin.'} />
        ) : (
          <Table head={['Voucher', 'Student', 'Class', 'Month', 'Total', 'Paid', 'Due', 'Status', 'Via', '']}>
            {filteredFees.map((f) => {
              const s = studentsById.get(f.studentId);
              return (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">{f.voucherNumber}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-900">{s?.name || '—'}</div>
                    <div className="text-xs text-slate-500">{s?.rollNumber || ''}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                    {s ? `${s.class}-${s.section}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.month}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{formatPKR(f.totalAmount)}</td>
                  <td className="px-3 py-2 text-emerald-700 whitespace-nowrap">{formatPKR(f.paidAmount)}</td>
                  <td className="px-3 py-2 text-rose-700 font-semibold whitespace-nowrap">{formatPKR(f.dueAmount)}</td>
                  <td className="px-3 py-2"><Badge tone={statusTone(f.status)}>{f.status}</Badge></td>
                  <td className="px-3 py-2 whitespace-nowrap" title={f.paymentBank || ''}>
                    {f.paymentChannel ? (
                      <Badge tone={f.paymentChannel === 'bank' ? 'blue' : 'amber'}>
                        {f.paymentChannel === 'bank' ? 'Bank' : 'Cash'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPrintFor(f)}
                        className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                        title="View / Print"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {s && (f.dueAmount || 0) > 0 && (
                        <a
                          href={buildWaLink(f, s, school?.name || '')}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          title="WhatsApp Reminder"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}
                      {!readOnly && (f.dueAmount || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => openCollect(f)}
                          className="p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"
                          title="Collect payment"
                        >
                          <Wallet className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Generate vouchers modal (admin only) */}
      {generateOpen && !readOnly && (
        <Modal
          title={`Generate Vouchers — ${genMonth}`}
          subtitle="Creates vouchers for all active students missing one this month"
          onClose={() => setGenerateOpen(false)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Month">
              <TextInput type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
            </Field>
            <Field label="Due date">
              <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Tuition fee (PKR)">
              <TextInput type="number" min="0" value={tuitionFee} onChange={(e) => setTuitionFee(e.target.value)} />
            </Field>
            <Field label="Transport fee (PKR)">
              <TextInput type="number" min="0" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} />
            </Field>
            <Field label="Exam fee (PKR)">
              <TextInput type="number" min="0" value={examFee} onChange={(e) => setExamFee(e.target.value)} />
            </Field>
            <Field label="Bank account on voucher">
              <TextInput value={bankLineFor(school)} disabled />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton onClick={() => setGenerateOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={generateVouchers} disabled={busy}>
              <Receipt className="w-4 h-4" /> {busy ? 'Generating…' : 'Generate'}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {/* Collect payment modal (admin only) */}
      {collectFor && !readOnly && (
        <Modal
          title="Collect Payment"
          subtitle={`${collectFor.voucherNumber} — ${studentsById.get(collectFor.studentId)?.name || ''}`}
          onClose={() => setCollectFor(null)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Amount (PKR)">
              <TextInput type="number" min="1" max={collectFor.dueAmount} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </Field>
            <Field label="Payment date">
              <TextInput type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Payment channel">
              <Select value={payChannel} onChange={(e) => setPayChannel(e.target.value)}>
                <option value="cash">Cash on counter</option>
                {(school?.bankAccounts || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    Bank — {b.bankName} · {b.accountNumber}{b.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 text-sm text-slate-600">
            Due: <b className="text-rose-700">{formatPKR(collectFor.dueAmount)}</b>
            {' · '}After payment: <b>{formatPKR(Math.max(0, collectFor.dueAmount - (parseFloat(payAmount) || 0)))}</b>
          </div>
          {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton onClick={() => setCollectFor(null)}>Cancel</GhostButton>
            <PrimaryButton onClick={collectPayment} disabled={busy}>
              <Wallet className="w-4 h-4" /> {busy ? 'Saving…' : 'Record Payment'}
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {/* Print modal */}
      {printFor && printStudent && (
        <FeeVoucherPrint
          voucher={printFor}
          student={printStudent}
          school={school}
          onClose={() => setPrintFor(null)}
        />
      )}
    </div>
  );
};

export default FeesManager;
