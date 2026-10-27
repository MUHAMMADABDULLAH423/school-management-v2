import React, { useMemo, useState } from 'react';
import {
  UserCheck, Clock, UserX,
} from 'lucide-react';
import { useCollection } from '../hooks/useFirestore';
import {
  Student, StaffMember, AttendanceRecord, FeeVoucher,
  defaultDateFilter, todayStr, filterMonths, filterAttendanceDate,
} from '../types';
import { Spinner, StatCard, Card, CardHeader } from './ui';
import { DateFilter, filterLabelFor } from './DateFilter';
import { FeeOverview, FeeSlice } from './FeeOverview';
import { AttendanceRoster, AttendanceSlice } from './AttendanceRoster';
import { OverviewKpiCards } from './OverviewKpiCards';

const iconCls = 'w-5 h-5';

/** Detail window target: clicking a chart slice opens a window with only that chart + its list. */
type DetailState =
  | { kind: 'fees'; slice: FeeSlice }
  | { kind: 'attendance'; slice: AttendanceSlice };

export const ExecutiveDashboard: React.FC = () => {
  const [filter, setFilter] = useState(defaultDateFilter());
  /** Open detail window (null = chart-only overview). */
  const [detail, setDetail] = useState<DetailState | null>(null);
  const { data: students, loading: l1 } = useCollection<Student>('students');
  const { data: staff, loading: l2 } = useCollection<StaffMember>('staff');
  const { data: attendance, loading: l3 } = useCollection<AttendanceRecord>('attendance');
  const { data: fees, loading: l4 } = useCollection<FeeVoucher>('fees');

  const label = filterLabelFor(filter);

  // Same filter mapping the admin overview uses: the KPI cards react to the
  // date filter instead of always showing today / this month.
  const attDate = filterAttendanceDate(filter);
  const feeMonths = filterMonths(filter);

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
      {/* KPI cards (left, wider) + date filter (right, narrower) */}
      <div className="grid gap-3 lg:grid-cols-4 items-start">
        <div className="lg:col-span-3">
          <OverviewKpiCards
            students={students}
            staff={staff}
            attendance={attendance}
            fees={fees}
            attendanceDate={attDate}
            feeMonths={feeMonths}
            cardTargets={{ staff: 'staff', fees: 'fees' }}
          />
        </div>
        <div className="lg:sticky lg:top-[4.5rem]">
          <DateFilter filter={filter} onChange={setFilter} compact />
        </div>
      </div>

      {/* Main view: chart-only cards. Clicking a slice opens the detail window
          (chart + list only); re-clicking the slice in the window comes back here. */}
      {detail ? (
        detail.kind === 'fees' ? (
          <FeeOverview
            key="fee-window"
            mode="window"
            fees={fees}
            students={students}
            filter={filter}
            filterLabel={label}
            windowSlice={detail.slice}
            onWindowSliceChange={(slice) =>
              setDetail(slice ? { kind: 'fees', slice } : null)
            }
          />
        ) : (
          <AttendanceRoster
            key="attendance-window"
            mode="window"
            records={attendance}
            students={students}
            filter={filter}
            filterLabel={label}
            windowSlice={detail.slice}
            onWindowSliceChange={(slice) =>
              setDetail(slice ? { kind: 'attendance', slice } : null)
            }
          />
        )
      ) : (
        <>
          <FeeOverview
            key="fee-chart"
            mode="chart"
            fees={fees}
            students={students}
            filter={filter}
            filterLabel={label}
            onSliceClick={(slice) => setDetail({ kind: 'fees', slice })}
          />

          <AttendanceRoster
            key="attendance-chart"
            mode="chart"
            records={attendance}
            students={students}
            filter={filter}
            filterLabel={label}
            onSliceClick={(slice) => setDetail({ kind: 'attendance', slice })}
          />

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
        </>
      )}
    </div>
  );
};
