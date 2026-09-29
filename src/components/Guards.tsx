import React, { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { Card } from './ui';

/**
 * Renders children only when the signed-in user's role is in `roles`;
 * otherwise shows a "Not authorized" card.
 */
export const RequireRole: React.FC<{ roles: UserRole[]; children: ReactNode }> = ({
  roles,
  children,
}) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return (
      <Card className="p-8">
        <div className="py-10 text-center">
          <div className="text-slate-300 text-4xl mb-2">🔒</div>
          <div className="text-sm font-semibold text-slate-600">Not signed in</div>
          <div className="text-xs text-slate-400 mt-1">Please sign in to continue.</div>
        </div>
      </Card>
    );
  }

  if (!roles.includes(currentUser.role)) {
    return (
      <Card className="p-8">
        <div className="py-10 text-center">
          <ShieldAlert className="w-10 h-10 text-rose-300 mx-auto mb-3" />
          <div className="text-sm font-semibold text-slate-600">Not authorized</div>
          <div className="text-xs text-slate-400 mt-1">
            This section requires one of: {roles.join(', ')}.
          </div>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
};
