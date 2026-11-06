/**
 * StudentIdCard — printable student ID card (credit-card size).
 *
 * Same overlay + window.print() pattern as FeeVoucherPrint: the action bar is
 * print:hidden, the card prints cleanly on its own. School name/logo come
 * from the `school` prop; student photo falls back to initials.
 */
import React from 'react';
import { GraduationCap, Printer, X } from 'lucide-react';
import { SchoolProfile, Student } from '../types';
import { Avatar } from './ui';

interface Props {
  student: Student;
  school: SchoolProfile | null;
  onClose: () => void;
}

const StudentIdCard: React.FC<Props> = ({ student, school, onClose }) => {
  const schoolName = school?.name || 'School';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 overflow-y-auto print:bg-white print:overflow-visible">
      {/* Action bar — never printed */}
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
        <div className="text-sm font-bold">
          Student ID Card <span className="font-normal text-slate-300">— {student.name}</span>
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

      <div className="p-6 flex justify-center print:p-0">
        {/* Card — 86 × 54 mm proportions (credit-card size) */}
        <div className="w-[336px] h-[212px] bg-white rounded-xl overflow-hidden shadow-2xl border border-slate-300 flex flex-col print:shadow-none print:border-slate-800 print:break-inside-avoid">
          {/* Header band */}
          <div className="bg-indigo-900 text-white px-3 py-2 flex items-center gap-2">
            {school?.logo ? (
              <img src={school.logo} alt="" className="w-8 h-8 rounded bg-white object-contain shrink-0" />
            ) : (
              <span className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-white" />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold uppercase tracking-wide leading-tight truncate">
                {schoolName}
              </div>
              <div className="text-[9px] font-semibold tracking-[0.2em] text-indigo-200">
                STUDENT ID CARD
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex items-center gap-3 px-3 py-2">
            <Avatar src={student.photo} name={student.name} size={72} />
            <div className="min-w-0">
              <div className="text-[15px] font-extrabold text-slate-900 leading-tight truncate">
                {student.name}
              </div>
              <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                <div>
                  <span className="font-bold text-slate-800">Class: </span>
                  {student.class}-{student.section}
                </div>
                <div>
                  <span className="font-bold text-slate-800">Roll No: </span>
                  {student.rollNumber}
                </div>
                <div>
                  <span className="font-bold text-slate-800">Admission No: </span>
                  {student.admissionNo || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Footer strip */}
          <div className="bg-slate-100 border-t border-slate-200 px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-600">
            <span className="truncate">
              <span className="font-bold text-slate-700">Parent: </span>
              {student.parentName || '—'}
            </span>
            <span className="shrink-0 ml-2">
              {student.academicYear ? `Session ${student.academicYear}` : school?.contact || ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentIdCard;
