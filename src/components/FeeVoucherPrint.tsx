/**
 * FeeVoucherPrint — printable 3-copy fee challan (Bank / School / Student).
 *
 * School name + address come from the `school` prop (schools/main). The bank
 * line comes from `voucher.bankSnapshot` (captured at generation time from the
 * principal-managed default bank account). Nothing is hardcoded.
 *
 * Parent page already hides app chrome on print via `.print-hidden` (index.css).
 * The action bar here is also print:hidden; the copies render cleanly.
 */
import React from 'react';
import { Printer, X } from 'lucide-react';
import { FeeVoucher, Student, SchoolProfile, formatPKR } from '../types';
import { Badge } from './ui';

interface Props {
  voucher: FeeVoucher;
  student: Student;
  school: SchoolProfile | null;
  onClose: () => void;
}

const statusTone = (s: string): 'green' | 'amber' | 'blue' | 'red' =>
  s === 'Paid' ? 'green' : s === 'Partial' ? 'amber' : s === 'Pending' ? 'blue' : 'red';

/** Normalize a Pakistani mobile number for wa.me links. */
export function waNumber(raw: string): string {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('92')) return d;
  if (d.startsWith('0')) return `92${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('3')) return `92${d}`;
  return d;
}

/** Build the WhatsApp fee-reminder link for a voucher (shared with the fees table). */
export function buildWaLink(voucher: FeeVoucher, student: Student, schoolName: string): string {
  const bankLine = voucher.bankSnapshot || '—';
  const waMsg = `Dear Parent, fee voucher ${voucher.voucherNumber} for ${student.name} (${student.class}-${student.section}), month ${voucher.month}:\nTotal: ${formatPKR(voucher.totalAmount)}\nPaid: ${formatPKR(voucher.paidAmount)}\nDue: ${formatPKR(voucher.dueAmount)}\nPlease pay by ${voucher.dueDate} at: ${bankLine}\n— ${schoolName}`;
  return `https://wa.me/${waNumber(student.parentWhatsApp || student.parentPhone)}?text=${encodeURIComponent(waMsg)}`;
}

const FeeVoucherPrint: React.FC<Props> = ({ voucher, student, school, onClose }) => {
  const schoolName = school?.name || '—';
  const schoolAddress = school?.address || '—';
  const bankLine = voucher.bankSnapshot || '—';

  const heads: { label: string; value: number }[] = [
    { label: 'Tuition Fee', value: voucher.tuitionFee },
    { label: 'Transport Fee', value: voucher.transportFee },
    { label: 'Exam Fee', value: voucher.examFee },
    { label: 'Late Fine', value: voucher.lateFine },
  ].filter((h) => h.value > 0);

  const Copy: React.FC<{ copyName: string }> = ({ copyName }) => (
    <div className="border-2 border-slate-800 bg-white p-5 print:break-inside-avoid">
      <div className="text-center border-b-2 border-slate-800 pb-3 mb-3">
        <div className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">{schoolName}</div>
        <div className="text-xs text-slate-600">{schoolAddress}</div>
        {school?.contact && <div className="text-xs text-slate-600">Ph: {school.contact}</div>}
        <div className="mt-2 inline-block px-3 py-0.5 bg-slate-900 text-white text-xs font-bold rounded-full">
          {copyName}
        </div>
      </div>

      <div className="text-xs bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 mb-3">
        <span className="font-bold text-slate-700">Deposit at: </span>
        <span className="text-slate-800">{bankLine}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div><span className="font-bold text-slate-600">Voucher No: </span><span className="font-mono">{voucher.voucherNumber}</span></div>
        <div><span className="font-bold text-slate-600">Month: </span>{voucher.month}</div>
        <div><span className="font-bold text-slate-600">Due Date: </span>{voucher.dueDate}</div>
        <div><span className="font-bold text-slate-600">Status: </span><Badge tone={statusTone(voucher.status)}>{voucher.status}</Badge></div>
      </div>

      <div className="text-xs mb-3">
        <div className="font-extrabold text-slate-900 text-sm">{student.name}</div>
        <div className="text-slate-600">Roll: {student.rollNumber} · Class: {student.class}-{student.section}</div>
        <div className="text-slate-600">Parent: {student.parentName || '—'}{student.parentPhone ? ` · ${student.parentPhone}` : ''}</div>
      </div>

      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1 font-bold text-slate-700">Particulars</th>
            <th className="py-1 text-right font-bold text-slate-700">Amount</th>
          </tr>
        </thead>
        <tbody>
          {heads.map((h) => (
            <tr key={h.label} className="border-b border-slate-100">
              <td className="py-1 text-slate-700">{h.label}</td>
              <td className="py-1 text-right text-slate-800">{formatPKR(h.value)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1 font-extrabold text-slate-900">Total</td>
            <td className="py-1 text-right font-extrabold text-slate-900">{formatPKR(voucher.totalAmount)}</td>
          </tr>
          <tr>
            <td className="py-1 text-slate-700">Paid</td>
            <td className="py-1 text-right text-emerald-700 font-semibold">{formatPKR(voucher.paidAmount)}</td>
          </tr>
          <tr>
            <td className="py-1 font-extrabold text-slate-900">Due</td>
            <td className="py-1 text-right font-extrabold text-rose-700">{formatPKR(voucher.dueAmount)}</td>
          </tr>
        </tbody>
      </table>

      {voucher.receiptNo && (
        <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs print:break-inside-avoid">
          <div className="text-slate-600">
            Receipt: <span className="font-mono font-semibold text-slate-800">{voucher.receiptNo}</span>
            {voucher.paidDate ? <span> · Paid on {voucher.paidDate}</span> : null}
          </div>
          {voucher.paymentChannel && (
            <div className="mt-1 font-extrabold text-slate-900">
              Payment Channel: {voucher.paymentChannel === 'bank'
                ? `Bank${voucher.paymentBank ? ` — ${voucher.paymentBank}` : ''}`
                : 'Cash on Counter'}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-6 text-xs text-slate-600">
        <div className="text-center">
          <div className="border-t border-slate-400 pt-1 w-32">Received By</div>
        </div>
        <div className="text-center">
          <div className="border-t border-slate-400 pt-1 w-32">Authorized Sign</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 overflow-y-auto print:bg-white print:overflow-visible">
      {/* Action bar — never printed */}
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
        <div className="text-sm font-bold">
          Fee Voucher <span className="font-mono text-slate-300">{voucher.voucherNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 print:p-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 print:block print:space-y-6 max-w-7xl mx-auto">
          <Copy copyName="Bank Copy" />
          <Copy copyName="School Copy" />
          <Copy copyName="Student Copy" />
        </div>
      </div>
    </div>
  );
};

export default FeeVoucherPrint;
