import React, { useMemo, useState } from 'react';
import {
  UserCheck, Clock, UserX,
} from 'lucide-react';
import { useCollection } from '../hooks/useFirestore';
import {
  Student, StaffMember, AttendanceRecord, FeeVoucher,
  defaultDateFilter, todayStr,
} from '../types';
import { Spinner, StatCard, Card, CardHeader } from './ui';
import { DateFilter, filterLabelFor } from './DateFilter';
import { FeeOverview } from './FeeOverview';
import { AttendanceRoster } from './AttendanceRoster';
import { OverviewKpiCards } from './OverviewKpiCards';

const iconCls = 'w-5 h-5';

export const ExecutiveDashboard: React.FC = () => {
  const [filter, setFilter] = useState(defaultDateFilter());
  const { data: students, loading: l1 } = useCollection<Student>('students');
  const { data: staff, loading: l2 } = useCollection<StaffMember>('staff');
  const { data: attendance, loading: l3 } = useCollection<AttendanceRecord>('attendance');
  const { data: fees, loading: l4 } = useCollection<FeeVoucher>('fees');

  const label = filterLabelFor(filter);


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
        <div className="lg:col-span-2">
          <OverviewKpiCards students={students} staff={staff} attendance={attendance} fees={fees} />
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
