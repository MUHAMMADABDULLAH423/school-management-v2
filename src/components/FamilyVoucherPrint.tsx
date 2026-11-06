/**
 * FamilyVoucherPrint — one combined fee challan for all children of a family
 * (siblings share a parentEmail), for a single month.
 *
 * Same overlay + window.print() pattern as FeeVoucherPrint. Copies are stacked
 * full-width (Bank / School / Student) because the per-child table is wide.
 * Children without a voucher that month are listed, not charged.
 */
import React from 'react';
import { Printer, X } from 'lucide-react';
import { FeeVoucher, Student, SchoolProfile, formatPKR } from '../types';
import { Badge } from './ui';

export interface FamilyEntry {
  student: Student;
  voucher: FeeVoucher;
}

interface Props {
  entries: FamilyEntry[];
  missing: Student[];
  parentName: string;
  parentEmail: string;
  month: string;
  school: SchoolProfile | null;
  onClose: () => void;
}

const FamilyVoucherPrint: React.FC<Props> = ({
  entries, missing, parentName, parentEmail, month, school, onClose,
}) => {
  const schoolName = school?.name || '—';
  const schoolAddress = school?.address || '—';
  const bankLine = entries[0]?.voucher.bankSnapshot || '—';
  const dueDate = entries[0]?.voucher.dueDate || '—';

  const showTransport = entries.some((e) => (e.voucher.transportFee || 0) > 0);
  const showExam = entries.some((e) => (e.voucher.examFee || 0) > 0);
  const showFine = entries.some((e) => (e.voucher.lateFine || 0) > 0);

  const sum = (pick: (v: FeeVoucher) => number) =>
    entries.reduce((t, e) => t + (pick(e.voucher) || 0), 0);
  const grandTotal = sum((v) => v.totalAmount);
  const grandPaid = sum((v) => v.paidAmount);
  const grandDue = sum((v) => v.dueAmount);

  const Copy: React.FC<{ copyName: string }> = ({ copyName }) => (
    <div className="border-2 border-slate-800 bg-white p-5 print:break-inside-avoid">
      <div className="text-center border-b-2 border-slate-800 pb-3 mb-3">
        <div className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">{schoolName}</div>
        <div className="text-xs text-slate-600">{schoolAddress}</div>
        {school?.contact && <div className="text-xs text-slate-600">Ph: {school.contact}</div>}
        <div className="mt-2 inline-block px-3 py-0.5 bg-slate-900 text-white text-xs font-bold rounded-full">
          {copyName} — Family Fee Voucher
        </div>
      </div>

      <div className="text-xs bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 mb-3">
        <span className="font-bold text-slate-700">Deposit at: </span>
        <span className="text-slate-800">{bankLine}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div><span className="font-bold text-slate-600">Parent: </span>{parentName || '—'}</div>
        <div><span className="font-bold text-slate-600">Month: </span>{month}</div>
        <div><span className="font-bold text-slate-600">Parent Email: </span><span className="break-all">{parentEmail}</span></div>
        <div><span className="font-bold text-slate-600">Due Date: </span>{dueDate}</div>
      </div>

      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1 font-bold text-slate-700">Student</th>
            <th className="py-1 font-bold text-slate-700">Voucher</th>
            <th className="py-1 text-right font-bold text-slate-700">Tuition</th>
            {showTransport && <th className="py-1 text-right font-bold text-slate-700">Transport</th>}
            {showExam && <th className="py-1 text-right font-bold text-slate-700">Exam</th>}
            {showFine && <th className="py-1 text-right font-bold text-slate-700">Fine</th>}
            <th className="py-1 text-right font-bold text-slate-700">Total</th>
            <th className="py-1 text-right font-bold text-slate-700">Paid</th>
            <th className="py-1 text-right font-bold text-slate-700">Due</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ student, voucher }) => (
            <tr key={voucher.id} className="border-b border-slate-100 align-top">
              <td className="py-1.5 pr-2">
                <div className="font-extrabold text-slate-900">{student.name}</div>
                <div className="text-slate-500">
                  Roll {student.rollNumber} · {student.class}-{student.section} ·{' '}
                  <Badge tone={voucher.status === 'Paid' ? 'green' : voucher.status === 'Partial' ? 'amber' : 'blue'}>
                    {voucher.status}
                  </Badge>
                </div>
              </td>
              <td className="py-1.5 font-mono text-slate-700 whitespace-nowrap">{voucher.voucherNumber}</td>
              <td className="py-1.5 text-right text-slate-800">{formatPKR(voucher.tuitionFee)}</td>
              {showTransport && <td className="py-1.5 text-right text-slate-800">{formatPKR(voucher.transportFee)}</td>}
              {showExam && <td className="py-1.5 text-right text-slate-800">{formatPKR(voucher.examFee)}</td>}
              {showFine && <td className="py-1.5 text-right text-slate-800">{formatPKR(voucher.lateFine)}</td>}
              <td className="py-1.5 text-right font-semibold text-slate-900">{formatPKR(voucher.totalAmount)}</td>
              <td className="py-1.5 text-right text-emerald-700">{formatPKR(voucher.paidAmount)}</td>
              <td className="py-1.5 text-right font-semibold text-rose-700">{formatPKR(voucher.dueAmount)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-800">
            <td colSpan={2} className="py-1.5 font-extrabold text-slate-900">Family Total</td>
            <td className="py-1.5 text-right font-extrabold text-slate-900">{formatPKR(sum((v) => v.tuitionFee))}</td>
            {showTransport && <td className="py-1.5 text-right font-extrabold text-slate-900">{formatPKR(sum((v) => v.transportFee))}</td>}
            {showExam && <td className="py-1.5 text-right font-extrabold text-slate-900">{formatPKR(sum((v) => v.examFee))}</td>}
            {showFine && <td className="py-1.5 text-right font-extrabold text-slate-900">{formatPKR(sum((v) => v.lateFine))}</td>}
            <td className="py-1.5 text-right font-extrabold text-slate-900">{formatPKR(grandTotal)}</td>
            <td className="py-1.5 text-right font-extrabold text-emerald-700">{formatPKR(grandPaid)}</td>
            <td className="py-1.5 text-right font-extrabold text-rose-700">{formatPKR(grandDue)}</td>
          </tr>
        </tbody>
      </table>

      {missing.length > 0 && (
        <p className="text-xs text-slate-500 mb-3">
          No voucher this month for: {missing.map((s) => s.name).join(', ')}.
        </p>
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
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
        <div className="text-sm font-bold">
          Family Fee Voucher <span className="font-normal text-slate-300">— {parentName || parentEmail} · {month}</span>
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
        <div className="space-y-6 max-w-4xl mx-auto print:space-y-6">
          <Copy copyName="Bank Copy" />
          <Copy copyName="School Copy" />
          <Copy copyName="Student Copy" />
        </div>
      </div>
    </div>
  );
};

export default FamilyVoucherPrint;
