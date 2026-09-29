import React, { useMemo, useState } from 'react';
import { Bell, BookOpenText, CalendarCheck, CalendarDays, GraduationCap, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection, useDoc } from '../hooks/useFirestore';
import {
  AttendanceRecord, StaffMember, Student, todayStr,
} from '../types';
import { Badge, Card, CardHeader, EmptyState, StatCard, Tabs } from '../components/ui';
import { AttendanceManager } from '../components/AttendanceManager';
import { DiaryManager } from '../components/DiaryManager';
import { MarksManager } from '../components/MarksManager';
import { TimetableManager } from '../components/TimetableManager';
import { NoticeList } from '../components/NoticeList';

const clsLabel = (c: string, s: string) => `${c} - ${s}`;

/** Teacher overview: my classes + today's attendance status + notices. */
const TeacherOverview: React.FC = () => {
  const { currentUser } = useAuth();
  const { data: students } = useCollection<Student>('students');
  const { data: attendance } = useCollection<AttendanceRecord>('attendance');
  const { data: myStaffDoc } = useDoc<StaffMember>('staff', currentUser?.staffId || 'none');

  const myClasses = useMemo(() => {
    const assigned = (myStaffDoc?.assignedClasses || []).filter(Boolean);
    if (assigned.length > 0) return assigned;
    // fallback: derive from students
    const set = new Set<string>();
    students.filter((s) => s.isActive).forEach((s) => set.add(clsLabel(s.class, s.section)));
    return [...set].sort();
  }, [myStaffDoc, students]);

  const today = todayStr();
  const classStats = useMemo(() => {
    return myClasses.map((cs) => {
      const total = students.filter((s) => s.isActive && clsLabel(s.class, s.section) === cs).length;
      const marked = attendance.filter((a) => a.type === 'student' && a.date === today && a.classSection === cs).length;
      const present = attendance.filter(
        (a) => a.type === 'student' && a.date === today && a.classSection === cs &&
          (a.status === 'Present' || a.status === 'Late' || a.status === 'HalfDay')
      ).length;
      return { classSection: cs, total, marked, present };
    });
  }, [myClasses, students, attendance, today]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="My Classes" value={String(myClasses.length)}
          icon={<BookOpenText className="w-5 h-5" />} tone="indigo" />
        <StatCard label="My Students" value={String(classStats.reduce((s, c) => s + c.total, 0))}
          icon={<GraduationCap className="w-5 h-5" />} tone="sky" />
        <StatCard label="Classes Marked Today"
          value={`${classStats.filter((c) => c.total > 0 && c.marked >= c.total).length}/${classStats.length}`}
          icon={<CalendarCheck className="w-5 h-5" />} tone="emerald" />
      </div>

      <Card>
        <CardHeader title="Today's Attendance — My Classes" subtitle={today} />
        <div className="p-5">
          {classStats.length === 0 ? (
            <EmptyState title="No classes assigned" hint="Ask your admin to assign classes to your staff profile." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {classStats.map((c) => (
                <div key={c.classSection} className="p-4 rounded-xl border border-slate-200">
                  <div className="text-sm font-bold text-slate-900 mb-1">{c.classSection}</div>
                  <div className="text-xs text-slate-500 mb-2">{c.total} students</div>
                  {c.marked === 0 ? (
                    <Badge tone="amber">Not marked</Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge tone={c.marked >= c.total ? 'green' : 'amber'}>
                        {c.marked}/{c.total} marked
                      </Badge>
                      <span className="text-xs text-slate-500">{c.present} present</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Latest Notices" />
        <div className="p-5">
          <NoticeList limit={5} />
        </div>
      </Card>
    </div>
  );
};

export const TeacherDashboard: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const [tab, setTab] = useState(initialTab || 'overview');

  return (
    <div>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
          { id: 'attendance', label: 'Mark Attendance', icon: <CalendarCheck className="w-4 h-4" /> },
          { id: 'diary', label: 'Diary', icon: <BookOpenText className="w-4 h-4" /> },
          { id: 'marks', label: 'Marks', icon: <GraduationCap className="w-4 h-4" /> },
          { id: 'timetable', label: 'Timetable', icon: <CalendarDays className="w-4 h-4" /> },
          { id: 'notices', label: 'Notices', icon: <Bell className="w-4 h-4" /> },
        ]}
      />
      {tab === 'overview' && <TeacherOverview />}
      {tab === 'attendance' && <AttendanceManager />}
      {tab === 'diary' && <DiaryManager teacherOnly />}
      {tab === 'marks' && <MarksManager />}
      {tab === 'timetable' && <TimetableManager />}
      {tab === 'notices' && (
        <Card>
          <CardHeader title="Notices" subtitle="Announcements from the school office." />
          <div className="p-5"><NoticeList /></div>
        </Card>
      )}
    </div>
  );
};
