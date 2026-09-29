import React, { useMemo } from 'react';
import { Megaphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { NotificationItem } from '../types';
import { Badge, EmptyState, Spinner } from './ui';

const audienceLabel = (n: NotificationItem) =>
  n.audience === 'all' ? 'Everyone' : n.audience === 'role' ? `Role: ${n.toRole}` : 'Individual';

function noticeVisibleTo(n: NotificationItem, uid: string, role: string): boolean {
  if (n.audience === 'all') return true;
  if (n.audience === 'role') return n.toRole === role;
  if (n.audience === 'user') return n.toUserId === uid;
  return false;
}

/**
 * Read-only notice feed filtered by audience (shared by teacher/staff/parent dashboards).
 */
export const NoticeList: React.FC<{ limit?: number }> = ({ limit = 20 }) => {
  const { currentUser } = useAuth();
  const { data: notices, loading } = useCollection<NotificationItem>('notifications');

  const visible = useMemo(() => {
    if (!currentUser) return [];
    return notices
      .filter((n) => noticeVisibleTo(n, currentUser.uid, currentUser.role))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }, [notices, currentUser, limit]);

  if (loading) return <Spinner />;

  if (visible.length === 0) {
    return <EmptyState title="No notices" hint="Published notices will appear here." />;
  }

  return (
    <div className="space-y-3">
      {visible.map((n) => (
        <div key={n.id} className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-bold text-slate-900">{n.title}</span>
                <Badge tone="blue">{audienceLabel(n)}</Badge>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.body}</p>
              <div className="mt-1.5 text-[11px] text-slate-400">{n.date} · by {n.createdBy}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
