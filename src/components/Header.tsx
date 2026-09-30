import React from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge } from './ui';
import { UserRole } from '../types';

const roleTone = (role: UserRole): 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'violet' => {
  switch (role) {
    case 'principal':
      return 'violet';
    case 'admin':
      return 'red';
    case 'teacher':
      return 'blue';
    case 'staff':
      return 'amber';
    case 'parent':
      return 'green';
    default:
      return 'slate';
  }
};

/**
 * Page top bar: title + subtitle on the left; current date + user chip on the right.
 * On desktop (md+), an optional hamburger toggles the sidebar open/closed.
 */
export const Header: React.FC<{
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}> = ({ title, subtitle, onMenuClick }) => {
  const { currentUser } = useAuth();

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <div className="min-w-0 flex items-center gap-1">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="hidden md:flex p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-200 active:bg-slate-300 shrink-0"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden sm:block text-xs font-semibold text-slate-500 tabular-nums">
          {today}
        </span>
        {currentUser && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-1 pr-3 py-1 shadow-sm">
            <Avatar src={currentUser.photoURL} name={currentUser.name} size={30} />
            <div className="leading-tight">
              <div className="text-xs font-bold text-slate-900 max-w-[120px] truncate">
                {currentUser.name}
              </div>
              <Badge tone={roleTone(currentUser.role)}>
                <span className="capitalize text-[10px]">{currentUser.role}</span>
              </Badge>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
