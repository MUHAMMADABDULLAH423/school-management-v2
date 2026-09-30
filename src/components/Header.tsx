import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Badge } from './ui';
import { UserRole } from '../types';

export const roleTone = (role: UserRole): 'green' | 'red' | 'amber' | 'blue' | 'slate' | 'violet' => {
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
 */
export const Header: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const { currentUser } = useAuth();

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide truncate">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
      </div>

      {/* Date + user chip: mobile only — on desktop these live in the dark top bar. */}
      <div className="flex items-center gap-3 shrink-0 md:hidden">
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
