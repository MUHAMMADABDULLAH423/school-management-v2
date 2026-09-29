import React, { ReactNode } from 'react';
import { LogOut, GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../hooks/useFirestore';
import { useConfirm } from './ui';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

/**
 * Responsive app sidebar.
 * - md+ : fixed vertical sidebar (slate-900).
 * - mobile: horizontal top bar with scrollable nav.
 * Logout always asks for confirmation first.
 */
export const Sidebar: React.FC<{
  active: string;
  onNavigate: (id: string) => void;
  items: NavItem[];
}> = ({ active, onNavigate, items }) => {
  const { currentUser, logout } = useAuth();
  const { school } = useSchool();
  const { ask, dialog } = useConfirm();

  const schoolName = school?.name || 'School Portal';

  const handleLogout = () => {
    ask({
      title: 'Sign out?',
      message: 'You will be signed out of the school portal.',
      confirmLabel: 'Sign out',
      onConfirm: () => {
        void logout();
      },
    });
  };

  const navButtonCls = (isActive: boolean, vertical: boolean) =>
    `flex items-center gap-2.5 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap ${
      vertical ? 'w-full px-3 py-2.5' : 'px-3 py-2'
    } ${
      isActive
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <>
      {/* ---- Desktop vertical sidebar ---- */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-slate-900 text-white min-h-screen sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold truncate leading-tight">{schoolName}</div>
            <div className="text-[11px] text-slate-400 capitalize">{currentUser?.role} portal</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto nice-scroll px-3 py-4 space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={navButtonCls(item.id === active, true)}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold rounded-xl text-slate-300 hover:bg-rose-900/40 hover:text-rose-200 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- Mobile top bar ---- */}
      <div className="md:hidden sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm font-extrabold truncate flex-1">{schoolName}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto nice-scroll px-3 pb-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={navButtonCls(item.id === active, false)}
            >
              <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {dialog}
    </>
  );
};
