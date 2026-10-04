import React, { useState } from 'react';
import {
  LayoutDashboard, Users, Building2, BadgeDollarSign, ScrollText,
  GraduationCap, UserCog, CalendarCheck, ClipboardList,
  Bell, CalendarDays, Wallet, BookOpen, Trophy, FileText, IdCard, Clock,
  Menu, MapPin, Layers,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useSchool } from './hooks/useFirestore';
import { Login } from './components/Login';
import { Sidebar, NavItem } from './components/Sidebar';
import { Header } from './components/Header';
import { SchoolBrand } from './components/SchoolBrand';
import { SchoolProfile } from './components/SchoolProfile';
import { PrincipalDashboard } from './dashboards/PrincipalDashboard';
import { AdminDashboard } from './dashboards/AdminDashboard';
import { TeacherDashboard } from './dashboards/TeacherDashboard';
import { StaffDashboard } from './dashboards/StaffDashboard';
import { ParentDashboard } from './dashboards/ParentDashboard';
import { seedDemoData } from './services/seed';
import { UserRole } from './types';
import {
  Card, Modal, Field, TextInput, PrimaryButton, Spinner, EmptyState,
  Avatar, PasswordInput,
} from './components/ui';

const iconCls = 'w-4 h-4';

/** Sidebar navigation per role. NOTE: principal has NO admissions/students items — admin-only by design. */
const NAV: Record<UserRole, NavItem[]> = {
  principal: [
    { id: 'overview', label: 'Executive Overview', icon: <LayoutDashboard className={iconCls} /> },
    { id: 'staff', label: 'Teachers & Staff', icon: <Users className={iconCls} /> },
    { id: 'classes', label: 'Classes', icon: <Layers className={iconCls} /> },
    { id: 'users', label: 'Users', icon: <UserCog className={iconCls} /> },
    { id: 'school', label: 'School Profile', icon: <Building2 className={iconCls} /> },
    { id: 'fees', label: 'Fee Overview', icon: <BadgeDollarSign className={iconCls} /> },
    { id: 'finance', label: 'Finance', icon: <Wallet className={iconCls} /> },
    { id: 'audit', label: 'Audit Log', icon: <ScrollText className={iconCls} /> },
  ],
  admin: [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className={iconCls} /> },
    { id: 'students', label: 'Students', icon: <GraduationCap className={iconCls} /> },
    { id: 'classes', label: 'Classes', icon: <Layers className={iconCls} /> },
    { id: 'staff', label: 'Teachers & Staff', icon: <Users className={iconCls} /> },
    { id: 'fees', label: 'Fees', icon: <BadgeDollarSign className={iconCls} /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck className={iconCls} /> },
    { id: 'staffatt', label: 'Staff Attendance', icon: <ClipboardList className={iconCls} /> },
    { id: 'academics', label: 'Academics', icon: <BookOpen className={iconCls} /> },
    { id: 'notices', label: 'Notices', icon: <Bell className={iconCls} /> },
    { id: 'holidays', label: 'Holidays', icon: <CalendarDays className={iconCls} /> },
  ],
  teacher: [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className={iconCls} /> },
    { id: 'attendance', label: 'Mark Attendance', icon: <CalendarCheck className={iconCls} /> },
    { id: 'myattendance', label: 'My Attendance', icon: <MapPin className={iconCls} /> },
    { id: 'diary', label: 'Diary', icon: <BookOpen className={iconCls} /> },
    { id: 'marks', label: 'Marks', icon: <Trophy className={iconCls} /> },
    { id: 'timetable', label: 'Timetable', icon: <Clock className={iconCls} /> },
    { id: 'notices', label: 'Notices', icon: <Bell className={iconCls} /> },
  ],
  staff: [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className={iconCls} /> },
    { id: 'myattendance', label: 'My Attendance', icon: <CalendarCheck className={iconCls} /> },
    { id: 'notices', label: 'Notices', icon: <Bell className={iconCls} /> },
    { id: 'profile', label: 'Profile', icon: <IdCard className={iconCls} /> },
  ],
  parent: [
    { id: 'children', label: 'My Children', icon: <GraduationCap className={iconCls} /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck className={iconCls} /> },
    { id: 'results', label: 'Results', icon: <Trophy className={iconCls} /> },
    { id: 'fees', label: 'Fees', icon: <BadgeDollarSign className={iconCls} /> },
    { id: 'diary', label: 'Diary', icon: <BookOpen className={iconCls} /> },
    { id: 'notices', label: 'Notices', icon: <Bell className={iconCls} /> },
  ],
};

/** Force password change on first login. */
const FirstLoginGate: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { changePassword, logout, currentUser } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    if (pw.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (pw !== pw2) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    const ok = await changePassword(pw);
    setBusy(false);
    if (ok) onDone();
    else setErr('Could not update password. Try again.');
  };

  return (
    <Modal onClose={() => {}} title="Set your password">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Welcome, <b>{currentUser?.name}</b>. This is your first sign-in — please set a new password to continue.
        </p>
        <Field label="New password">
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min. 6 characters" />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat password" />
        </Field>
        {err && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={logout} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Sign out</button>
          <PrimaryButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save password'}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
};

/** First-run wizard: create the school profile (+ optional demo data) before anything else. */
const FirstRunSetup: React.FC = () => {
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  const loadDemo = async () => {
    if (!confirm('Load demo data (sample school, staff, students, fees)? You can delete it later.')) return;
    setSeeding(true);
    const r = await seedDemoData();
    setSeedMsg(r.message);
    setSeeding(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <SchoolProfile setupMode />
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-slate-800">Just exploring?</div>
              <div className="text-sm text-slate-500">Load sample data to see the dashboards in action.</div>
            </div>
            <PrimaryButton onClick={loadDemo} disabled={seeding}>
              {seeding ? 'Loading…' : 'Load demo data'}
            </PrimaryButton>
          </div>
          {seedMsg && <div className="text-sm text-slate-600 mt-2">{seedMsg}</div>}
        </Card>
      </div>
    </div>
  );
};

const Shell: React.FC = () => {
  const { currentUser, isLoading, firebaseReady } = useAuth();
  const { school, loading: schoolLoading } = useSchool();
  const [view, setView] = useState('__default__');
  const [pwChanged, setPwChanged] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (isLoading || schoolLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Spinner />
      </div>
    );
  }
  if (!firebaseReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <Card className="max-w-md">
          <EmptyState
            title="Firebase is not configured"
            hint="Copy .env.example to .env and fill in your Firebase project keys, then restart the dev server."
          />
        </Card>
      </div>
    );
  }
  if (!currentUser) return <Login />;
  if (currentUser.isFirstLogin && !pwChanged) {
    return <FirstLoginGate onDone={() => setPwChanged(true)} />;
  }

  const role = currentUser.role;
  const needsSetup = (role === 'principal' || role === 'admin') && !school;
  if (needsSetup) return <FirstRunSetup />;

  const items = NAV[role];
  const activeView = view === '__default__' ? items[0].id : view;
  const activeItem = items.find((i) => i.id === activeView) || items[0];

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ---- Desktop top bar: school brand stays fixed here, never collapses ---- */}
      <div className="hidden md:flex sticky top-0 z-40 h-14 items-center gap-2 px-4 bg-slate-900 text-white border-b border-slate-800">
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-2 -ml-1 rounded-lg text-slate-200 hover:bg-slate-800 active:bg-slate-700"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <SchoolBrand size={32} />
        <div className="min-w-0">
          <div className="text-sm font-extrabold truncate leading-tight">
            {school?.name || 'School Portal'}
          </div>
          <div className="text-[11px] text-slate-400 capitalize">{role} portal</div>
        </div>
        <div className="flex-1" />
        <span className="hidden lg:block text-xs font-semibold text-slate-300 tabular-nums">
          {today}
        </span>
        {currentUser && (
          <div className="flex items-center gap-2.5 pl-1">
            <Avatar src={currentUser.photoURL} name={currentUser.name} size={34} />
            <div className="leading-tight">
              <div className="text-xs font-bold text-white max-w-[140px] truncate">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-400 capitalize">{currentUser.role}</div>
            </div>
          </div>
        )}
      </div>

      <div className="md:flex">
        <Sidebar
          active={activeItem.id}
          onNavigate={setView}
          items={items}
          desktopOpen={sidebarOpen}
        />
        <div className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-4 pt-3 pb-6 space-y-4">
            <Header title={activeItem.label} />
            {role === 'principal' && <PrincipalDashboard key={activeItem.id} initialTab={activeItem.id} />}
            {role === 'admin' && <AdminDashboard key={activeItem.id} initialTab={activeItem.id} />}
            {role === 'teacher' && <TeacherDashboard key={activeItem.id} initialTab={activeItem.id} />}
            {role === 'staff' && <StaffDashboard key={activeItem.id} initialTab={activeItem.id} />}
            {role === 'parent' && <ParentDashboard key={activeItem.id} initialTab={activeItem.id} />}
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <Shell />
  </AuthProvider>
);

export default App;
