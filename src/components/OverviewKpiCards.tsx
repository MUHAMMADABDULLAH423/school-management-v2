import React from 'react';
import { GraduationCap, Users, BadgeDollarSign } from 'lucide-react';
import {
  Student, StaffMember, AttendanceRecord, FeeVoucher,
  todayStr, formatPKR,
} from '../types';

/**
 * The three rich overview KPI cards (students / staff / fee collection),
 * shared by the admin and principal portals so both show the same cards.
 */
export const OverviewKpiCards: React.FC<{
  students: Student[];
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  fees: FeeVoucher[];
}> = ({ students, staff, attendance, fees }) => {
  const today = todayStr();
  const monthKey = today.slice(0, 7);
  const activeStudents = students.filter((s) => s.isActive);
  const activeStaff = staff.filter((s) => s.isActive);

  // Today's student attendance breakdown
  const todayAtt = attendance.filter((a) => a.type === 'student' && a.date === today);
  const stuPresent = todayAtt.filter((a) => a.status === 'Present').length;
  const stuAbsent = todayAtt.filter((a) => a.status === 'Absent').length;
  const stuLeaveLate = todayAtt.filter(
    (a) => a.status === 'Leave' || a.status === 'Late' || a.status === 'HalfDay'
  ).length;

  // Today's staff attendance breakdown
  const todayStaffAtt = attendance.filter((a) => a.type === 'staff' && a.date === today);
  const staffPresent = todayStaffAtt.filter((a) => a.status === 'Present').length;
  const staffAbsentLeave = todayStaffAtt.filter((a) => a.status !== 'Present').length;
  const staffPresentPct = todayStaffAtt.length > 0
    ? Math.round((staffPresent / todayStaffAtt.length) * 100)
    : 0;

  // Fee collection for the current month
  const monthVouchers = fees.filter((f) => f.month === monthKey);
  const feeCollected = monthVouchers.reduce((s, f) => s + (Number(f.paidAmount) || 0), 0);
  const feePending = monthVouchers
    .filter((f) => f.status !== 'Paid')
    .reduce((s, f) => s + (Number(f.dueAmount) || 0), 0);
  const feeTotal = feeCollected + feePending;
  const feePct = feeTotal > 0 ? Math.round((feeCollected / feeTotal) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* ---- Total students with today's attendance breakdown ---- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-[11px] font-bold tracking-wide text-slate-500">TOTAL STUDENTS</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 shrink-0">Today</span>
        </div>
        <div className="text-3xl font-extrabold text-slate-900 mt-2 tabular-nums">
          {activeStudents.length.toLocaleString()}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-xl bg-emerald-50 px-2 py-2 text-center">
            <div className="text-[10px] font-bold text-emerald-700">PRESENT</div>
            <div className="text-base font-extrabold text-emerald-800 tabular-nums">{stuPresent}</div>
          </div>
          <div className="rounded-xl bg-rose-50 px-2 py-2 text-center">
            <div className="text-[10px] font-bold text-rose-700">ABSENT</div>
            <div className="text-base font-extrabold text-rose-800 tabular-nums">{stuAbsent}</div>
          </div>
          <div className="rounded-xl bg-amber-50 px-2 py-2 text-center">
            <div className="text-[10px] font-bold text-amber-700">LEAVE / LATE</div>
            <div className="text-base font-extrabold text-amber-800 tabular-nums">{stuLeaveLate}</div>
          </div>
        </div>
      </div>

      {/* ---- Teachers & staff with today's attendance ---- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-[11px] font-bold tracking-wide text-slate-500">TEACHERS &amp; STAFF</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700 shrink-0">Active</span>
        </div>
        <div className="text-3xl font-extrabold text-slate-900 mt-2 tabular-nums">
          {activeStaff.length.toLocaleString()}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl bg-blue-50 px-2 py-2 text-center">
            <div className="text-[10px] font-bold text-blue-700">PRESENT TODAY</div>
            <div className="text-base font-extrabold text-blue-800 tabular-nums">
              {staffPresent} ({staffPresentPct}%)
            </div>
          </div>
          <div className="rounded-xl bg-slate-100 px-2 py-2 text-center">
            <div className="text-[10px] font-bold text-slate-600">ABSENT / LEAVE</div>
            <div className="text-base font-extrabold text-slate-700 tabular-nums">{staffAbsentLeave}</div>
          </div>
        </div>
      </div>

      {/* ---- Fee collection this month ---- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <BadgeDollarSign className="w-5 h-5 text-teal-600" />
            </div>
            <div className="text-[11px] font-bold tracking-wide text-slate-500">FEE COLLECTION</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 shrink-0">This Month</span>
        </div>
        <div className="text-3xl font-extrabold text-slate-900 mt-2 tabular-nums">
          {formatPKR(feeCollected)}
        </div>
        <div className="h-2 rounded-full bg-slate-100 mt-3 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${feePct}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Collected: {formatPKR(feeCollected)}
          </span>
          <span className="flex items-center gap-1.5 text-rose-600">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            Pending: {formatPKR(feePending)}
          </span>
        </div>
      </div>
    </div>
  );
};
