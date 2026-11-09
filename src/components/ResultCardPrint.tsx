/**
 * ResultCardPrint — printable report card for one student (parent download).
 *
 * School header (logo, name, address, contact, academic year) comes from the
 * LIVE `school` prop (schools/main) — nothing is hardcoded, so changing the
 * School Profile changes every printed report card automatically.
 *
 * Each exam group lists subjects with marks AND the teacher who entered them
 * (ExamResult.enteredBy already stores the teacher's name at entry time).
 * Print via the browser dialog (Save as PDF), same pattern as FeeVoucherPrint.
 * App chrome already hides on print via `.print-hidden` (index.css).
 */
import React, { useMemo } from 'react';
import { Printer, X } from 'lucide-react';
import { ExamResult, SchoolProfile, Student, gradeFor } from '../types';

interface Props {
  student: Student;
  results: ExamResult[];
  school: SchoolProfile | null;
  onClose: () => void;
}

const pctOf = (obt: number, tot: number) => (tot > 0 ? Math.round((obt / tot) * 100) : 0);

const ResultCardPrint: React.FC<Props> = ({ student, results, school, onClose }) => {
  const schoolName = school?.name || '—';
  const schoolAddress = school?.address || '—';

  /** Group by exam (e.g. Midterm, Final, Quiz 1), newest first. */
  const groups = useMemo(() => {
    const map = new Map<string, ExamResult[]>();
    results.forEach((r) => {
      const key = r.examType || 'Test';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return [...map.entries()]
      .map(([examType, rows]) => ({
        examType,
        rows: [...rows].sort((a, b) => a.subject.localeCompare(b.subject)),
        date: rows.map((r) => r.date).sort().pop() || '',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [results]);

  const overall = useMemo(() => {
    const obt = results.reduce((t, r) => t + (r.obtainedMarks || 0), 0);
    const tot = results.reduce((t, r) => t + (r.totalMarks || 0), 0);
    return { obt, tot, pct: pctOf(obt, tot), grade: gradeFor(obt, tot) };
  }, [results]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 overflow-y-auto print:bg-white print:overflow-visible">
      {/* Action bar — never printed */}
      <div className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:hidden">
        <div className="text-sm font-bold">
          Report Card <span className="font-normal text-slate-300">— {student.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={results.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
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
        <div className="max-w-3xl mx-auto bg-white border border-slate-300 print:border-0 p-6 print:p-0">
          {results.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-bold text-slate-900">No results yet for {student.name}</p>
              <p className="text-sm text-slate-500 mt-1">Results appear here once teachers enter them.</p>
            </div>
          ) : (
            <>
              {/* School header — always from the live School Profile */}
              <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
                <div className="flex items-center justify-center gap-3">
                  {school?.logo && (
                    <img src={school.logo} alt="School logo" className="w-16 h-16 object-contain" />
                  )}
                  <div className="text-left">
                    <div className="text-xl font-extrabold text-slate-900 uppercase tracking-wide leading-tight">
                      {schoolName}
                    </div>
                    <div className="text-xs text-slate-600">{schoolAddress}</div>
                    {school?.contact && <div className="text-xs text-slate-600">Ph: {school.contact}</div>}
                    {school?.email && <div className="text-xs text-slate-600">{school.email}</div>}
                  </div>
                </div>
                {school?.affiliation && (
                  <div className="text-[11px] text-slate-500 mt-1">{school.affiliation}</div>
                )}
                <div className="mt-3 inline-block px-4 py-1 bg-slate-900 text-white text-sm font-bold rounded-full">
                  REPORT CARD
                </div>
                {school?.academicYear && (
                  <div className="text-xs text-slate-600 mt-1.5">Academic Year: {school.academicYear}</div>
                )}
              </div>

              {/* Student block */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-5">
                <div><span className="font-bold text-slate-600">Student: </span><span className="font-extrabold text-slate-900 text-sm">{student.name}</span></div>
                <div><span className="font-bold text-slate-600">Class: </span><span className="text-slate-800">{student.class}-{student.section}</span></div>
                <div><span className="font-bold text-slate-600">Roll No: </span><span className="text-slate-800">{student.rollNumber}</span></div>
                {student.admissionNo && (
                  <div><span className="font-bold text-slate-600">Admission No: </span><span className="text-slate-800">{student.admissionNo}</span></div>
                )}
                <div><span className="font-bold text-slate-600">Parent: </span><span className="text-slate-800">{student.parentName || '—'}</span></div>
                <div><span className="font-bold text-slate-600">Date: </span><span className="text-slate-800">{new Date().toISOString().slice(0, 10)}</span></div>
              </div>

              {/* One table per exam */}
              {groups.map((g) => {
                const obt = g.rows.reduce((t, r) => t + (r.obtainedMarks || 0), 0);
                const tot = g.rows.reduce((t, r) => t + (r.totalMarks || 0), 0);
                const pct = pctOf(obt, tot);
                return (
                  <div key={g.examType} className="mb-5 print:break-inside-avoid">
                    <div className="flex items-baseline justify-between bg-slate-100 border border-slate-300 rounded-t-lg px-3 py-2">
                      <span className="text-sm font-extrabold text-slate-900">{g.examType}</span>
                      {g.date && <span className="text-xs text-slate-500">{g.date}</span>}
                    </div>
                    <table className="w-full text-xs border border-t-0 border-slate-300">
                      <thead>
                        <tr className="border-b border-slate-300 text-left bg-slate-50">
                          <th className="py-1.5 px-3 font-bold text-slate-700">Subject</th>
                          <th className="py-1.5 px-3 font-bold text-slate-700">Teacher</th>
                          <th className="py-1.5 px-3 text-right font-bold text-slate-700">Obtained</th>
                          <th className="py-1.5 px-3 text-right font-bold text-slate-700">Total</th>
                          <th className="py-1.5 px-3 text-right font-bold text-slate-700">%</th>
                          <th className="py-1.5 px-3 text-right font-bold text-slate-700">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100">
                            <td className="py-1.5 px-3 text-slate-800">{r.subject}</td>
                            <td className="py-1.5 px-3 text-slate-600">{r.enteredBy || '—'}</td>
                            <td className="py-1.5 px-3 text-right text-slate-800">{r.obtainedMarks}</td>
                            <td className="py-1.5 px-3 text-right text-slate-800">{r.totalMarks}</td>
                            <td className="py-1.5 px-3 text-right text-slate-800">{pctOf(r.obtainedMarks, r.totalMarks)}%</td>
                            <td className="py-1.5 px-3 text-right font-bold text-slate-900">
                              {r.grade || gradeFor(r.obtainedMarks, r.totalMarks)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-extrabold text-slate-900">
                          <td className="py-1.5 px-3" colSpan={2}>Total</td>
                          <td className="py-1.5 px-3 text-right">{obt}</td>
                          <td className="py-1.5 px-3 text-right">{tot}</td>
                          <td className="py-1.5 px-3 text-right">{pct}%</td>
                          <td className="py-1.5 px-3 text-right">{gradeFor(obt, tot)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Overall summary */}
              <div className="flex justify-between items-center border-2 border-slate-800 rounded-lg px-4 py-2.5 text-sm mb-6 print:break-inside-avoid">
                <span className="font-extrabold text-slate-900">Overall Result</span>
                <span className="text-slate-700">
                  {overall.obt} / {overall.tot} · {overall.pct}% · Grade{' '}
                  <b className="text-slate-900">{overall.grade}</b>
                </span>
              </div>

              {/* Signatures */}
              <div className="flex justify-between mt-8 text-xs text-slate-600">
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1 w-36">Class Teacher</div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1 w-36">Principal</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultCardPrint;
