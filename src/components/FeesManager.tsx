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
  Receipt, Plus, Eye, Wallet, Banknote, AlertCircle, CircleDollarSign, MessageCircle, Users,
} from 'lucide-react';
import { db } from '../config/firebase';
import { useCollection, useSchool } from '../hooks/useFirestore';
import { useAuth } from '../context/AuthContext';
import { FeeVoucher, FeeStatus, PaymentClaim, PaymentMethod, ClassSection, Student, SchoolProfile, formatPKR, monthStr, todayStr } from '../types';
import {
  Card, CardHeader, Modal, Field, TextInput, PrimaryButton, GhostButton,
  Badge, SearchInput, Select, Table, EmptyState, Spinner, StatCard,
} from './ui';
import FeeVoucherPrint, { buildWaLink } from './FeeVoucherPrint';
import FamilyVoucherPrint, { FamilyEntry } from './FamilyVoucherPrint';
import { PaymentClaims, notifyParent } from './PaymentClaims';
import { payOptionsFor } from './ParentPayModal';

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
  const { data: claims } = useCollection<PaymentClaim>('paymentClaims');
  const { data: classes } = useCollection<ClassSection>('classes');
  const { school } = useSchool();
  const { currentUser } = useAuth();

  const [monthFilter, setMonthFilter] = useState(monthStr());
  const [allMonths, setAllMonths] = useState(false);
  const [search, setSearch] = useState('');
  /** Class filter for the voucher table (Classes menu). */
  const [classFilter, setClassFilter] = useState('all');

  const classOptions = useMemo(
    () => classes
      .map((c) => `${c.name} - ${c.section}`)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [classes]
  );
  /** Card-driven quick filter: paid / pending / defaulters vouchers. */
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'defaulters'>('all');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [collectFor, setCollectFor] = useState<FeeVoucher | null>(null);
  const [printFor, setPrintFor] = useState<FeeVoucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Family voucher: picker modal + printable combined challan. */
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyEmail, setFamilyEmail] = useState('');
  const [familyMonth, setFamilyMonth] = useState(monthStr());
  const [familyPrint, setFamilyPrint] = useState<{
    entries: FamilyEntry[]; missing: Student[]; parentName: string; parentEmail: string; month: string;
  } | null>(null);

  // Generate-voucher form state
  const [genMonth, setGenMonth] = useState(monthStr());
  const [tuitionFee, setTuitionFee] = useState('2500');
  const [transportFee, setTransportFee] = useState('0');
  const [examFee, setExamFee] = useState('0');
  const [dueDate, setDueDate] = useState(() => `${monthStr()}-10`);

  // Collect-payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayStr());
  /** 'cash' = cash on counter, 'proof' = online payment with parent proof
   * (Easypaisa / JazzCash / bank). The old per-bank options are gone — the
   * proof itself carries the method, so the bank entry is no longer picked here. */
  const [payChannel, setPayChannel] = useState('cash');
  /** Proof method + txn id when there is no attached parent claim yet. */
  const [proofMethod, setProofMethod] = useState<PaymentMethod>('easypaisa');
  const [proofTxn, setProofTxn] = useState('');
  /** Full-size receipt screenshot preview. */
  const [shotPreview, setShotPreview] = useState<string | null>(null);

  /** School accounts parents pay into (Easypaisa / JazzCash / banks). */
  const proofOptions = useMemo(() => payOptionsFor(school), [school]);
  const proofLabelFor = (m: PaymentMethod): string => {
    const o = proofOptions.find((x) => x.method === m);
    return o ? `${o.label} — ${o.detail}` : m;
  };

  /** Pending parent claim per voucher (for the "Proof" badge in the table). */
  const claimByFee = useMemo(() => {
    const map = new Map<string, PaymentClaim>();
    claims
      .filter((c) => c.status === 'pending')
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .forEach((c) => { if (!map.has(c.feeId)) map.set(c.feeId, c); });
    return map;
  }, [claims]);

  /** Pending parent claim for the voucher open in the Collect modal. */
  const pendingClaim = useMemo(
    () => (collectFor ? claimByFee.get(collectFor.id) || null : null),
    [collectFor, claimByFee]
  );

  const studentsById = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.id, s));
    return m;
  }, [students]);

  const defaulterIds = useMemo(
    () => new Set(students.filter((s) => s.isActive && s.feeStatus === 'Defaulter').map((s) => s.id)),
    [students]
  );

  const monthFees = useMemo(
    () => (allMonths ? [...fees] : fees.filter((f) => f.month === monthFilter))
      .sort((a, b) => a.voucherNumber.localeCompare(b.voucherNumber)),
    [fees, monthFilter, allMonths]
  );

  const filteredFees = useMemo(() => {
    let list = monthFees;
    if (statusFilter === 'paid') list = list.filter((f) => f.status === 'Paid');
    else if (statusFilter === 'pending') list = list.filter((f) => (f.dueAmount || 0) > 0);
    else if (statusFilter === 'defaulters') list = list.filter((f) => defaulterIds.has(f.studentId));
    if (classFilter !== 'all') {
      const want = classFilter.trim().toLowerCase();
      list = list.filter((f) => {
        const s = studentsById.get(f.studentId);
        return !!s && `${s.class} - ${s.section}`.trim().toLowerCase() === want;
      });
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => {
      const s = studentsById.get(f.studentId);
      return [f.voucherNumber, s?.name, s?.rollNumber, f.status].some((v) =>
        (v || '').toLowerCase().includes(q)
      );
    });
  }, [monthFees, statusFilter, defaulterIds, search, studentsById, classFilter]);

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
    // If the parent already sent proof for this voucher, it auto-attaches:
    // amount + method + txn come from the claim, channel becomes 'proof'.
    const claim = claims
      .filter((c) => c.feeId === v.id && c.status === 'pending')
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    setCollectFor(v);
    setPayAmount(String(claim ? claim.amount : (v.dueAmount || 0)));
    setPayDate(todayStr());
    setPayChannel(claim ? 'proof' : 'cash');
    setProofMethod(claim?.method || 'easypaisa');
    setProofTxn(claim?.txnId || '');
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
    const isProof = payChannel === 'proof';
    const method: PaymentMethod = pendingClaim?.method || proofMethod;
    const methodLabel = isProof
      ? (pendingClaim?.methodLabel || proofLabelFor(method))
      : '';
    const txn = isProof ? (pendingClaim?.txnId || proofTxn.trim()) : '';
    if (isProof && !pendingClaim && !txn) {
      setError('Transaction ID is required for online proof payments.');
      return;
    }
    setBusy(true);
    try {
      const newPaid = (collectFor.paidAmount || 0) + amount;
      const newDue = Math.max(0, (collectFor.totalAmount || 0) - newPaid);
      const status: FeeStatus = newDue <= 0 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Pending';
      const receiptNo = collectFor.receiptNo || (txn ? txn : `RCPT-${Date.now().toString().slice(-8)}`);
      await updateDoc(doc(db, 'fees', collectFor.id), {
        paidAmount: newPaid, dueAmount: newDue, status,
        paidDate: payDate, receiptNo,
        paymentChannel: isProof ? method : 'cash',
        paymentBank: methodLabel,
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

      // Recording a payment against an attached parent claim approves it.
      if (pendingClaim) {
        await updateDoc(doc(db, 'paymentClaims', pendingClaim.id), {
          status: 'approved', reviewedBy: currentUser.name, reviewedAt: new Date().toISOString(),
        });
        await notifyParent(st?.parentId, currentUser.name, 'Fee payment approved',
          `${formatPKR(amount)} received for ${st?.name || 'your child'} (${collectFor.month}) via ${methodLabel}. Receipt ${receiptNo}.`);
      }

      await auditLog(currentUser.uid, currentUser.name, 'Fee collected',
        `Collected ${formatPKR(amount)} against ${collectFor.voucherNumber} (${st?.name || ''}); receipt ${receiptNo}; via ${isProof ? `${methodLabel}${pendingClaim ? ' (parent proof approved)' : ' (online proof)'}` : 'cash (counter)'}`);
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

  const monthScope = allMonths ? 'all months' : monthFilter;
  const toggleStatus = (key: 'paid' | 'pending' | 'defaulters') =>
    setStatusFilter((cur) => (cur === key ? 'all' : key));
  const cardBtn = (active: boolean) =>
    `text-left w-full rounded-2xl cursor-pointer transition hover:shadow-md ${active ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}`;

  /** Families = active students grouped by parent email, with 2+ children. */
  const families = useMemo(() => {
    const groups = new Map<string, { email: string; parentName: string; children: Student[] }>();
    students.forEach((s) => {
      if (!s.isActive) return;
      const email = (s.parentEmail || '').trim().toLowerCase();
      if (!email) return;
      const g = groups.get(email) || { email, parentName: s.parentName || '', children: [] };
      g.children.push(s);
      if (!g.parentName && s.parentName) g.parentName = s.parentName;
      groups.set(email, g);
    });
    return [...groups.values()]
      .filter((g) => g.children.length >= 2)
      .sort((a, b) => (a.parentName || a.email).localeCompare(b.parentName || b.email));
  }, [students]);

  /** Selected family's vouchers for the picked month + children missing one. */
  const familyPreview = useMemo(() => {
    if (!familyEmail) return { entries: [] as FamilyEntry[], missing: [] as Student[] };
    const fam = families.find((f) => f.email === familyEmail);
    if (!fam) return { entries: [] as FamilyEntry[], missing: [] as Student[] };
    const entries: FamilyEntry[] = [];
    const missing: Student[] = [];
    fam.children.forEach((st) => {
      const v = fees.find((f) => f.studentId === st.id && f.month === familyMonth);
      if (v) entries.push({ student: st, voucher: v });
      else missing.push(st);
    });
    return { entries, missing };
  }, [families, familyEmail, familyMonth, fees]);

  return (
    <div className="space-y-5">
      <PaymentClaims />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button type="button" onClick={() => toggleStatus('paid')} title="Show paid vouchers" className={cardBtn(statusFilter === 'paid')}>
          <StatCard
            label={`Collected — ${monthScope}`}
            value={formatPKR(collected)}
            sub={`${monthFees.length} vouchers`}
            icon={<Banknote className="w-5 h-5" />}
            tone="emerald"
          />
        </button>
        <button type="button" onClick={() => toggleStatus('pending')} title="Show pending vouchers" className={cardBtn(statusFilter === 'pending')}>
          <StatCard
            label={`Pending — ${monthScope}`}
            value={formatPKR(pending)}
            icon={<CircleDollarSign className="w-5 h-5" />}
            tone="amber"
          />
        </button>
        <button type="button" onClick={() => toggleStatus('defaulters')} title="Show defaulter vouchers" className={cardBtn(statusFilter === 'defaulters')}>
          <StatCard
            label="Defaulters"
            value={String(defaulterCount)}
            sub="active students"
            icon={<AlertCircle className="w-5 h-5" />}
            tone="rose"
          />
        </button>
      </div>

      <Card>
        <CardHeader
          title={readOnly ? 'Fee Center (view only)' : 'Fee Center'}
          subtitle={`${filteredFees.length} vouchers${allMonths ? ' · all months' : ` · ${monthFilter}`}${statusFilter !== 'all' ? ` · ${statusFilter}` : ''}`}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAllMonths((v) => !v)}
                title="Show vouchers from all months"
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-bold border transition ${allMonths ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
              >
                All
              </button>
              <TextInput
                type="month"
                value={monthFilter}
                disabled={allMonths}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-auto disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => { setFamilyMonth(monthFilter); setFamilyEmail(families[0]?.email || ''); setFamilyOpen(true); }}
                title="One combined voucher for siblings (same parent email)"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
              >
                <Users className="w-4 h-4" /> Family Voucher
              </button>
              {!readOnly && (
                <PrimaryButton onClick={() => { setGenMonth(monthFilter); setDueDate(`${monthFilter}-10`); setError(''); setGenerateOpen(true); }}>
                  <Plus className="w-4 h-4" /> Generate Vouchers
                </PrimaryButton>
              )}
            </div>
          }
        />
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search voucher, student, roll…" />
          </div>
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            title="Filter by class"
            className="sm:w-52 shrink-0"
          >
            <option value="all">All Classes</option>
            {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        {feesLoading || studentsLoading ? (
          <Spinner />
        ) : filteredFees.length === 0 ? (
          <EmptyState title="No vouchers" hint={statusFilter !== 'all' ? 'No vouchers match this filter — click the card again to clear it.' : readOnly ? 'No vouchers for this view.' : 'Generate vouchers for this month to begin.'} />
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
                      <Badge tone={f.paymentChannel === 'cash' ? 'amber' : f.paymentChannel === 'bank' ? 'blue' : 'green'}>
                        {f.paymentChannel === 'cash' ? 'Cash' : f.paymentChannel === 'bank' ? 'Bank' : f.paymentChannel === 'easypaisa' ? 'Easypaisa' : 'JazzCash'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {claimByFee.get(f.id) && (
                        <span
                          className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold"
                          title="Parent ne online payment ka proof bheja hai — Collect khol kar check karein aur approve karein"
                        >
                          Proof
                        </span>
                      )}
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
                <option value="proof">Online payment — parent proof (Easypaisa / JazzCash / Bank)</option>
              </Select>
            </Field>
          </div>

          {payChannel === 'proof' && (
            <div className="mt-4">
              {pendingClaim ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <div className="text-sm font-bold text-amber-900">Parent payment proof — auto-attached</div>
                  <div className="mt-1 text-sm text-amber-900">
                    {pendingClaim.methodLabel} · {formatPKR(pendingClaim.amount)} · Txn{' '}
                    <span className="font-mono font-bold">{pendingClaim.txnId}</span>
                  </div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    Sent by {pendingClaim.submittedBy} on {pendingClaim.submittedAt.slice(0, 10)}
                  </div>
                  {pendingClaim.screenshot && (
                    <button type="button" onClick={() => setShotPreview(pendingClaim.screenshot || null)} className="mt-2 block" title="View receipt screenshot">
                      <img src={pendingClaim.screenshot} alt="Payment receipt" className="w-20 h-20 object-cover rounded-xl border border-amber-300 hover:border-amber-500" />
                    </button>
                  )}
                  <p className="mt-2 text-xs font-semibold text-amber-900">
                    Record karne par ye claim approve ho jayega aur parent ko notice mil jayega.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-600">
                    Is voucher ke liye parent ka koi pending proof nahi hai — method chunein aur transaction ID likhein.
                  </p>
                  {proofOptions.length === 0 ? (
                    <p className="text-xs font-semibold text-amber-700">
                      School Profile mein Easypaisa / JazzCash / bank account set karein — warna proof ka method nahi dikhega.
                    </p>
                  ) : (
                    <Field label="Paid via">
                      <Select value={proofMethod} onChange={(e) => setProofMethod(e.target.value as PaymentMethod)}>
                        {(['easypaisa', 'jazzcash', 'bank'] as PaymentMethod[])
                          .filter((m) => proofOptions.some((o) => o.method === m))
                          .map((m) => {
                            const o = proofOptions.find((x) => x.method === m)!;
                            return <option key={m} value={m}>{o.label} — {o.detail}</option>;
                          })}
                      </Select>
                    </Field>
                  )}
                  <Field label="Transaction ID *">
                    <TextInput value={proofTxn} onChange={(e) => setProofTxn(e.target.value)} placeholder="e.g. 84739201" className="font-mono" />
                  </Field>
                </div>
              )}
            </div>
          )}
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

      {/* Receipt screenshot preview (from an attached parent claim) */}
      {shotPreview && (
        <Modal
          title="Payment receipt"
          subtitle="Parent's submitted proof"
          onClose={() => setShotPreview(null)}
        >
          <img src={shotPreview} alt="Payment receipt" className="w-full rounded-xl border border-slate-200" />
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

      {/* Family voucher picker modal */}
      {familyOpen && (
        <Modal
          title="Family Fee Voucher"
          subtitle="One combined challan for siblings — same parent email"
          onClose={() => setFamilyOpen(false)}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Family">
              <Select value={familyEmail} onChange={(e) => setFamilyEmail(e.target.value)}>
                {families.length === 0 && <option value="">— No families with 2+ children —</option>}
                {families.map((f) => (
                  <option key={f.email} value={f.email}>
                    {f.parentName || f.email} — {f.children.length} children
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Month">
              <TextInput type="month" value={familyMonth} onChange={(e) => setFamilyMonth(e.target.value)} />
            </Field>
          </div>
          {familyEmail && (
            <div className="mt-4 space-y-1.5">
              {familyPreview.entries.map(({ student, voucher }) => (
                <div key={voucher.id} className="flex flex-wrap justify-between gap-2 text-sm text-slate-700">
                  <span className="font-semibold">{student.name} <span className="font-normal text-slate-500">({student.rollNumber} · {student.class}-{student.section})</span></span>
                  <span>Total {formatPKR(voucher.totalAmount)} · Due <b className="text-rose-700">{formatPKR(voucher.dueAmount)}</b></span>
                </div>
              ))}
              {familyPreview.missing.map((s) => (
                <div key={s.id} className="text-sm text-slate-400">
                  No voucher for {s.name} in {familyMonth}
                </div>
              ))}
              {familyPreview.entries.length > 0 && (
                <div className="pt-2 mt-1 border-t border-slate-200 text-sm font-bold text-slate-900 flex justify-between">
                  <span>Family due</span>
                  <span className="text-rose-700">
                    {formatPKR(familyPreview.entries.reduce((t, e) => t + (e.voucher.dueAmount || 0), 0))}
                  </span>
                </div>
              )}
              {familyPreview.entries.length === 0 && (
                <p className="text-sm text-slate-500">No vouchers for this family in {familyMonth}.</p>
              )}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <GhostButton onClick={() => setFamilyOpen(false)}>Cancel</GhostButton>
            <PrimaryButton
              disabled={familyPreview.entries.length === 0}
              onClick={() => {
                const fam = families.find((f) => f.email === familyEmail);
                setFamilyPrint({
                  entries: familyPreview.entries,
                  missing: familyPreview.missing,
                  parentName: fam?.parentName || '',
                  parentEmail: familyEmail,
                  month: familyMonth,
                });
                setFamilyOpen(false);
              }}
            >
              <Eye className="w-4 h-4" /> View / Print
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {/* Family voucher print overlay */}
      {familyPrint && (
        <FamilyVoucherPrint
          entries={familyPrint.entries}
          missing={familyPrint.missing}
          parentName={familyPrint.parentName}
          parentEmail={familyPrint.parentEmail}
          month={familyPrint.month}
          school={school}
          onClose={() => setFamilyPrint(null)}
        />
      )}
    </div>
  );
};

export default FeesManager;
