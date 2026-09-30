import React, { useMemo, useState } from 'react';
import {
  Users, GraduationCap, Briefcase, CalendarCheck, Banknote, Wallet,
  UserCheck, Clock, UserX,
} from 'lucide-react';
import { useCollection } from '../hooks/useFirestore';
import {
  Student, StaffMember, AttendanceRecord, FeeVoucher,
  defaultDateFilter, todayStr, monthStr, formatPKR,
} from '../types';
import { Spinner, StatCard, Card, CardHeader } from './ui';
import { DateFilter, filterLabelFor, monthLabel } from './DateFilter';
import { FeeOverview } from './FeeOverview';
import { AttendanceRoster } from './AttendanceRoster';

const iconCls = 'w-5 h-5';

export const ExecutiveDashboard: React.FC = () => {
  const [filter, setFilter] = useState(defaultDateFilter());
  const { data: students, loading: l1 } = useCollection<Student>('students');
  const { data: staff, loading: l2 } = useCollection<StaffMember>('staff');
  const { data: attendance, loading: l3 } = useCollection<AttendanceRecord>('attendance');
  const { data: fees, loading: l4 } = useCollection<FeeVoucher>('fees');

  const label = filterLabelFor(filter);

  const kpis = useMemo(() => {
    const activeStudents = students.filter((s) => s.isActive);
    const teachers = staff.filter((s) => s.role === 'teacher' && s.isActive);
    const nonTeaching = staff.filter((s) => s.role === 'staff' && s.isActive);

    const today = todayStr();
    const todayRecords = attendance.filter((r) => r.type === 'student' && r.date === today);
    const presentToday = todayRecords.filter(
      (r) => r.status === 'Present' || r.status === 'HalfDay' || r.status === 'Late'
    ).length;
    const todayRate =
      todayRecords.length > 0 ? Math.round((presentToday / todayRecords.length) * 100) : null;

    const curMonth = monthStr();
    const monthFees = fees.filter((f) => f.month === curMonth);
    const collected = monthFees.reduce((a, f) => a + f.paidAmount, 0);
    const pending = monthFees.reduce((a, f) => a + f.dueAmount, 0);

    return { activeStudents, teachers, nonTeaching, todayRecords, presentToday, todayRate, collected, pending, curMonth };
  }, [students, staff, attendance, fees]);

  const staffStrip = useMemo(() => {
    const today = todayStr();
    const recs = attendance.filter((r) => r.type === 'staff' && r.date === today);
    return {
      present: recs.filter((r) => r.status === 'Present' || r.status === 'HalfDay').length,
      late: recs.filter((r) => r.status === 'Late').length,
      absent: recs.filter((r) => r.status === 'Absent').length,
    };
  }, [attendance]);

  if (l1 || l2 || l3 || l4) return <Spinner />;

  return (
    <div className="space-y-4">
      {/* KPI cards (left) + date filter (right, sticky) */}
      <div className="grid gap-4 lg:grid-cols-3 items-start">
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label="Total Students"
            value={String(kpis.activeStudents.length)}
            sub={`${students.length} records`}
            icon={<Users className={iconCls} />}
            tone="indigo"
          />
          <StatCard
            label="Teachers"
            value={String(kpis.teachers.length)}
            sub="active teaching staff"
            icon={<GraduationCap className={iconCls} />}
            tone="sky"
          />
          <StatCard
            label="Staff"
            value={String(kpis.nonTeaching.length)}
            sub="active non-teaching"
            icon={<Briefcase className={iconCls} />}
            tone="violet"
          />
          <StatCard
            label="Today's Attendance"
            value={kpis.todayRate === null ? '—' : `${kpis.todayRate}%`}
            sub={
              kpis.todayRecords.length === 0
                ? 'no records today'
                : `${kpis.presentToday} of ${kpis.todayRecords.length} present`
            }
            icon={<CalendarCheck className={iconCls} />}
            tone="emerald"
          />
          <StatCard
            label="Fee Collected"
            value={formatPKR(kpis.collected)}
            sub={monthLabel(kpis.curMonth)}
            icon={<Banknote className={iconCls} />}
            tone="emerald"
          />
          <StatCard
            label="Fee Pending"
            value={formatPKR(kpis.pending)}
            sub={monthLabel(kpis.curMonth)}
            icon={<Wallet className={iconCls} />}
            tone="rose"
          />
        </div>
        <div className="lg:sticky lg:top-[4.5rem]">
          <DateFilter filter={filter} onChange={setFilter} compact />
        </div>
      </div>

      <FeeOverview fees={fees} students={students} filter={filter} filterLabel={label} />

      <AttendanceRoster records={attendance} students={students} filter={filter} filterLabel={label} />

      {/* Staff attendance summary strip */}
      <Card>
        <CardHeader
          title="Staff Attendance"
          subtitle="Today's staff check-ins"
          pill={todayStr()}
        />
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Present"
            value={String(staffStrip.present)}
            icon={<UserCheck className={iconCls} />}
            tone="emerald"
          />
          <StatCard
            label="Late"
            value={String(staffStrip.late)}
            icon={<Clock className={iconCls} />}
            tone="amber"
          />
          <StatCard
            label="Absent"
            value={String(staffStrip.absent)}
            icon={<UserX className={iconCls} />}
            tone="rose"
          />
        </div>
      </Card>
    </div>
  );
};
