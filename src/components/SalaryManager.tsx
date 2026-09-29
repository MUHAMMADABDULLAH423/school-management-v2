import React, { useMemo, useState } from 'react';
import { BadgeCheck, Banknote, Plus } from 'lucide-react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { SalaryRecord, StaffMember, formatPKR, monthStr, todayStr } from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Field, PrimaryButton, Select,
  Spinner, StatCard, Table, TextInput,
} from './ui';

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'SALARY',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * Salary disbursement — admin generates monthly payroll, marks Paid.
 * Doc id = `${month}_${staffId}`.
 */
export const SalaryManager: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const { data: staff, loading: loadingStaff } = useCollection<StaffMember>('staff');
  const { data: salaries, loading: loadingSalary } = useCollection<SalaryRecord>('salary');

  const [month, setMonth] = useState(monthStr());
  const [staffId, setStaffId] = useState('');
  const [basicPay, setBasicPay] = useState('');
  const [allowances, setAllowances] = useState('');
  const [deductions, setDeductions] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [staff]
  );

  const netPay = (Number(basicPay) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0);
  const selStaff = activeStaff.find((s) => s.id === staffId);

  const pickStaff = (id: string) => {
    setStaffId(id);
    const m = activeStaff.find((s) => s.id === id);
    if (m?.salary) setBasicPay(String(m.salary));
    const existing = salaries.find((r) => r.month === month && r.staffId === id);
    if (existing) {
      setBasicPay(String(existing.basicPay));
      setAllowances(String(existing.allowances));
      setDeductions(String(existing.deductions));
    }
  };

  const monthRecords = useMemo(
    () => salaries.filter((r) => r.month === month),
    [salaries, month]
  );
  const monthTotal = useMemo(() => monthRecords.reduce((s, r) => s + r.netPay, 0), [monthRecords]);
  const paidCount = monthRecords.filter((r) => r.status === 'Paid').length;

  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name || '—';
  const photoOf = (id: string) => staff.find((s) => s.id === id)?.photo;

  const generate = async () => {
    if (!currentUser || !staffId || !(Number(basicPay) > 0)) return;
    setSaving(true);
    setMsg('');
    try {
      await setDoc(doc(db, 'salary', `${month}_${staffId}`), {
        staffId, month,
        basicPay: Number(basicPay) || 0, allowances: Number(allowances) || 0,
        deductions: Number(deductions) || 0, netPay,
        status: 'Pending',
      }, { merge: true });
      await logAudit(currentUser.uid, currentUser.name, 'Generated salary',
        `${selStaff?.name || staffId} — ${month} — net ${formatPKR(netPay)}`);
      setMsg(`Salary generated for ${selStaff?.name} (${month}).`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to generate.');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (r: SalaryRecord) => {
    if (!currentUser) return;
    try {
      await setDoc(doc(db, 'salary', r.id), { status: 'Paid', paidDate: todayStr() }, { merge: true });
      await logAudit(currentUser.uid, currentUser.name, 'Paid salary',
        `${nameOf(r.staffId)} — ${r.month} — ${formatPKR(r.netPay)}`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to update.');
    }
  };

  if (loadingStaff || loadingSalary) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Salary Disbursement"
        subtitle="Generate monthly payroll and mark payments."
        action={
          <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
        }
      />
      <div className="p-5">
        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">{msg}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          <StatCard label="Month Payroll" value={formatPKR(monthTotal)} sub={`${monthRecords.length} staff`}
            icon={<Banknote className="w-5 h-5" />} tone="violet" />
          <StatCard label="Paid" value={`${paidCount}/${monthRecords.length}`} sub={`for ${month}`}
            icon={<BadgeCheck className="w-5 h-5" />} tone="emerald" />
        </div>

        {isAdmin && (
          <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="text-sm font-bold text-slate-800 mb-3">Generate salary for {month}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Field label="Staff">
                <Select value={staffId} onChange={(e) => pickStaff(e.target.value)}>
                  <option value="">— Select —</option>
                  {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Basic Pay (PKR)">
                <TextInput type="number" min={0} value={basicPay} onChange={(e) => setBasicPay(e.target.value)} />
              </Field>
              <Field label="Allowances (PKR)">
                <TextInput type="number" min={0} value={allowances} onChange={(e) => setAllowances(e.target.value)} />
              </Field>
              <Field label="Deductions (PKR)">
                <TextInput type="number" min={0} value={deductions} onChange={(e) => setDeductions(e.target.value)} />
              </Field>
              <Field label="Net Pay (auto)">
                <TextInput value={formatPKR(Math.max(0, netPay))} disabled className="font-bold" />
              </Field>
            </div>
            <div className="mt-3">
              <PrimaryButton type="button" onClick={generate} disabled={saving || !staffId || !(Number(basicPay) > 0)}>
                <Plus className="w-4 h-4" /> {saving ? 'Generating…' : 'Generate / Update'}
              </PrimaryButton>
            </div>
          </div>
        )}

        {monthRecords.length === 0 ? (
          <EmptyState title={`No salaries for ${month}`} hint={isAdmin ? 'Generate payroll above.' : ''} />
        ) : (
          <Table head={['Staff', 'Basic', 'Allowances', 'Deductions', 'Net Pay', 'Status', ...(isAdmin ? ['Action'] : [])]}>
            {monthRecords
              .slice()
              .sort((a, b) => nameOf(a.staffId).localeCompare(nameOf(b.staffId)))
              .map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={photoOf(r.staffId)} name={nameOf(r.staffId)} size={30} />
                      <span className="font-semibold text-slate-900">{nameOf(r.staffId)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{formatPKR(r.basicPay)}</td>
                  <td className="px-3 py-2">{formatPKR(r.allowances)}</td>
                  <td className="px-3 py-2">{formatPKR(r.deductions)}</td>
                  <td className="px-3 py-2 font-bold text-slate-900">{formatPKR(r.netPay)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.status === 'Paid' ? 'green' : 'amber'}>
                      {r.status}{r.paidDate ? ` · ${r.paidDate}` : ''}
                    </Badge>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      {r.status !== 'Paid' && (
                        <PrimaryButton type="button" onClick={() => markPaid(r)} className="!px-3 !py-1.5 text-xs">
                          Mark Paid
                        </PrimaryButton>
                      )}
                    </td>
                  )}
                </tr>
              ))}
          </Table>
        )}
      </div>
    </Card>
  );
};
