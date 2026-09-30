import React, { ReactNode, useEffect, useState } from 'react';
import { LogOut, GraduationCap, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../hooks/useFirestore';
import { useConfirm } from './ui';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

/**
 * Responsive app navigation.
 * - md+ : fixed vertical sidebar (slate-900).
 * - mobile: slim sticky top bar with a hamburger button that opens/closes
 *   a slide-in drawer. No horizontal nav row — everything lives in the drawer.
 * Logout always asks for confirmation first.
 */
export const Sidebar: React.FC<{
  active: string;
  onNavigate: (id: string) => void;
  items: NavItem[];
  /** Desktop (md+) sidebar visibility — toggled by the hamburger in the page header. */
  desktopOpen: boolean;
}> = ({ active, onNavigate, items, desktopOpen }) => {
  const { currentUser, logout } = useAuth();
  const { school } = useSchool();
  const { ask, dialog } = useConfirm();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const schoolName = school?.name || 'School Portal';

  const handleLogout = () => {
    setDrawerOpen(false);
    ask({
      title: 'Sign out?',
      message: 'You will be signed out of the school portal.',
      confirmLabel: 'Sign out',
      onConfirm: () => {
        void logout();
      },
    });
  };

  const handleNavigate = (id: string) => {
    setDrawerOpen(false);
    onNavigate(id);
  };

  // Close the drawer on Escape and lock body scroll while it is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const navButtonCls = (isActive: boolean) =>
    `flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap ${
      isActive
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  const brandBlock = (compact: boolean) => (
    <>
      <div
        className={`${
          compact ? 'w-8 h-8 rounded-lg' : 'w-9 h-9 rounded-xl'
        } bg-indigo-600 flex items-center justify-center shrink-0`}
      >
        <GraduationCap className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-white`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold truncate leading-tight">{schoolName}</div>
        <div className="text-[11px] text-slate-400 capitalize">{currentUser?.role} portal</div>
      </div>
    </>
  );

  return (
    <>
      {/* ---- Desktop vertical sidebar (toggleable via header hamburger) ---- */}
      {desktopOpen && (
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-slate-900 text-white min-h-screen sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
          {brandBlock(false)}
        </div>

        <nav className="flex-1 overflow-y-auto nice-scroll px-3 py-4 space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={navButtonCls(item.id === active)}
            >
              <span className="w-5 h-5 flex items-center justify-center shrink-0">
                {item.icon}
              </span>
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
      )}

      {/* ---- Mobile: slim top bar with hamburger ---- */}
      <div className="md:hidden sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-200 hover:bg-slate-800 active:bg-slate-700"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          {brandBlock(true)}
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ---- Mobile: slide-in drawer ---- */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${drawerOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!drawerOpen}
      >
        {/* backdrop */}
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* panel */}
        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-label="Menu"
        >
          <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
            {brandBlock(true)}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto nice-scroll px-3 py-4 space-y-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={navButtonCls(item.id === active)}
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  {item.icon}
                </span>
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
      </div>

      {dialog}
    </>
  );
};
