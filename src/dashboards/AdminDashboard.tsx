import React, { useState } from 'react';
import {
  CalendarDays, ClipboardList,
  GraduationCap,
} from 'lucide-react';
import { useCollection } from '../hooks/useFirestore';
import { useAuth } from '../context/AuthContext';
import {
  AttendanceRecord, FeeVoucher, HolidayItem, StaffMember, Student,
  formatPKR, todayStr,
} from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Tabs,
} from '../components/ui';
import { AttendanceManager } from '../components/AttendanceManager';
import { StaffAttendance } from '../components/StaffAttendance';
import { DiaryManager } from '../components/DiaryManager';
import { MarksManager } from '../components/MarksManager';
import { TimetableManager } from '../components/TimetableManager';
import { NoticesManager } from '../components/NoticesManager';
import { HolidaysManager } from '../components/HolidaysManager';
import { OverviewKpiCards } from '../components/OverviewKpiCards';
// Built by sibling agents — imported normally:
import { StaffManager } from '../components/StaffManager';
import StudentAdmission from '../components/StudentAdmission';
import FeesManager from '../components/FeesManager';

const feeTone = (s: string): 'green' | 'amber' | 'red' | 'blue' =>
  s === 'Paid' ? 'green' : s === 'Partial' ? 'blue' : s === 'Defaulter' ? 'red' : 'amber';

const attTone = (s: string): 'green' | 'red' | 'amber' | 'blue' | 'violet' =>
  s === 'Present' ? 'green' : s === 'Absent' ? 'red' : s === 'Late' ? 'amber'
    : s === 'HalfDay' ? 'blue' : 'violet';

/** Admin overview: KPIs + quick lists. */
const AdminOverview: React.FC = () => {
  const { data: students } = useCollection<Student>('students');
  const { data: staff } = useCollection<StaffMember>('staff');
  const { data: attendance } = useCollection<AttendanceRecord>('attendance');
  const { data: fees } = useCollection<FeeVoucher>('fees');
  const { data: holidays } = useCollection<HolidayItem>('holidays');

  const today = todayStr();

  const todayAtt = attendance.filter((a) => a.type === 'student' && a.date === today);

  const pendingFees = fees.filter((f) => f.status !== 'Paid');

  const absentToday = todayAtt
    .filter((a) => a.status === 'Absent')
    .slice(0, 5);
  const nameOf = (id?: string) => students.find((s) => s.id === id);

  const pendingVouchers = pendingFees
    .slice()
    .sort((a, b) => (b.dueAmount || 0) - (a.dueAmount || 0))
    .slice(0, 5);

  const upcomingHolidays = holidays
    .filter((h) => h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <OverviewKpiCards students={students} staff={staff} attendance={attendance} fees={fees} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Absent Today" pill={`${absentToday.length}`} />
          <div className="p-4">
            {absentToday.length === 0 ? (
              <EmptyState title="None absent today" />
            ) : (
              <div className="space-y-2">
                {absentToday.map((a) => {
                  const st = nameOf(a.studentId);
                  return (
                    <div key={a.id} className="flex items-center gap-2.5">
                      <Avatar src={st?.photo} name={st?.name || '?'} size={30} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{st?.name || a.studentId}</div>
                        <div className="text-[11px] text-slate-500">{st ? `${st.class} - ${st.section} · Roll ${st.rollNumber}` : ''}</div>
                      </div>
                      <Badge tone={attTone(a.status)}>{a.status}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Top Pending Fees" pill={`${pendingVouchers.length}`} />
          <div className="p-4">
            {pendingVouchers.length === 0 ? (
              <EmptyState title="All fees collected" />
            ) : (
              <div className="space-y-2">
                {pendingVouchers.map((f) => {
                  const st = nameOf(f.studentId);
                  return (
                    <div key={f.id} className="flex items-center gap-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{st?.name || f.studentId}</div>
                        <div className="text-[11px] text-slate-500">{f.voucherNumber} · {f.month}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900">{formatPKR(f.dueAmount)}</div>
                        <Badge tone={feeTone(f.status)}>{f.status}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Upcoming Holidays" pill={`${upcomingHolidays.length}`} />
          <div className="p-4">
            {upcomingHolidays.length === 0 ? (
              <EmptyState title="No upcoming holidays" />
            ) : (
              <div className="space-y-2">
                {upcomingHolidays.map((h) => (
                  <div key={h.id} className="flex items-center gap-2.5">
                    <CalendarDays className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{h.name}</div>
                      <div className="text-[11px] text-slate-500">{h.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

const AcademicsTab: React.FC = () => {
  const [sub, setSub] = useState('diary');
  return (
    <div>
      <Tabs
        active={sub}
        onChange={setSub}
        tabs={[
          { id: 'diary', label: 'Diary & Homework', icon: <ClipboardList className="w-4 h-4" /> },
          { id: 'marks', label: 'Marks', icon: <GraduationCap className="w-4 h-4" /> },
          { id: 'timetable', label: 'Timetable', icon: <CalendarDays className="w-4 h-4" /> },
        ]}
      />
      {sub === 'diary' && <DiaryManager />}
      {sub === 'marks' && <MarksManager />}
      {sub === 'timetable' && <TimetableManager editable />}
    </div>
  );
};

export const AdminDashboard: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  useAuth(); // ensures auth context is live
  // Navigation lives in the sidebar / hamburger drawer; the tab mirrors the
  // selected nav item (Shell remounts on nav change via key).
  const tab = initialTab || 'overview';

  return (
    <div>
      {tab === 'overview' && <AdminOverview />}
      {tab === 'students' && <StudentAdmission />}
      {tab === 'staff' && <StaffManager allowRoleChange />}
      {tab === 'fees' && <FeesManager />}
      {tab === 'attendance' && <AttendanceManager />}
      {tab === 'staffatt' && <StaffAttendance />}
      {tab === 'academics' && <AcademicsTab />}
      {tab === 'notices' && <NoticesManager />}
      {tab === 'holidays' && <HolidaysManager />}
    </div>
  );
};
