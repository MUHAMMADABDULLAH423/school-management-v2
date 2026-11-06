/**
 * StudentRecordsPrint — printable student register (Data Extractor, PDF side).
 *
 * Same overlay + window.print() pattern as FeeVoucherPrint. Pick "Save as PDF"
 * in the print dialog to get a PDF file. Shows the same filtered list the
 * CSV export downloads, so screen and file always agree.
 */
import React from 'react';
import { Printer, X } from 'lucide-react';
import { SchoolProfile, Student } from '../types';

interface Props {
  students: Student[];
  school: SchoolProfile | null;
  subtitle: string;
  onClose: () => void;
}

const StudentRecordsPrint: React.FC<Props> = ({ students, school, subtitle, onClose }) => {
  const schoolName = school?.name || '—';
  const schoolAddress = school?.address || '—';
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 overflow-y-auto print:bg-white print:overflow-visible">
      {/* Action bar — never printed */}
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
        <div className="text-sm font-bold">
          Student Records <span className="font-normal text-slate-300">— {students.length} students</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
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
        <div className="max-w-5xl mx-auto bg-white p-5 print:p-0">
          <div className="text-center border-b-2 border-slate-800 pb-3 mb-3">
            <div className="text-lg font-extrabold text-slate-900 uppercase tracking-wide">{schoolName}</div>
            <div className="text-xs text-slate-600">{schoolAddress}</div>
            {school?.contact && <div className="text-xs text-slate-600">Ph: {school.contact}</div>}
            <div className="mt-2 text-sm font-bold text-slate-800">Student Records</div>
            <div className="text-xs text-slate-500">{subtitle} · {today}</div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th className="py-1 pr-2 font-bold text-slate-700">#</th>
                <th className="py-1 pr-2 font-bold text-slate-700">Student</th>
                <th className="py-1 pr-2 font-bold text-slate-700">Roll</th>
                <th className="py-1 pr-2 font-bold text-slate-700">Class</th>
                <th className="py-1 pr-2 font-bold text-slate-700">Parent</th>
                <th className="py-1 pr-2 font-bold text-slate-700">Phone</th>
                <th className="py-1 font-bold text-slate-700">Fee Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-500">{i + 1}</td>
                  <td className="py-1.5 pr-2 font-semibold text-slate-900">
                    {s.name}
                    <span className="block font-normal text-slate-500">Adm {s.admissionNo || '—'}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-slate-700 whitespace-nowrap">{s.rollNumber}</td>
                  <td className="py-1.5 pr-2 text-slate-700 whitespace-nowrap">{s.class}-{s.section}</td>
                  <td className="py-1.5 pr-2 text-slate-700">{s.parentName || '—'}</td>
                  <td className="py-1.5 pr-2 text-slate-700 whitespace-nowrap">{s.parentPhone || s.parentWhatsApp || '—'}</td>
                  <td className="py-1.5 text-slate-700">{s.feeStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {students.length === 0 && (
            <p className="text-sm text-slate-500 py-4 text-center">No students in this list.</p>
          )}
          <p className="text-[11px] text-slate-400 mt-3">Generated from the school portal · {today}</p>
        </div>
      </div>
    </div>
  );
};

export default StudentRecordsPrint;
