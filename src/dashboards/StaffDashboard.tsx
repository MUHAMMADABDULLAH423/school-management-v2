import React, { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { StaffMember } from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Spinner,
} from '../components/ui';
import { StaffAttendance } from '../components/StaffAttendance';
import { NoticeList } from '../components/NoticeList';
import { ImageUploadField } from '../components/ImageUploadField';

/** Find the staff record for the current user (by staffId or userId link). */
function useMyStaff(currentUser: { staffId?: string; uid: string } | null) {
  const { data: staff, loading } = useCollection<StaffMember>('staff');
  const mine = useMemo(() => {
    if (!currentUser) return null;
    return staff.find((s) => (currentUser.staffId && s.id === currentUser.staffId) || s.userId === currentUser.uid) || null;
  }, [staff, currentUser]);
  return { mine, loading };
}

/** Staff profile card used in overview. */
const ProfileCard: React.FC = () => {
  const { currentUser } = useAuth();
  const { mine, loading } = useMyStaff(currentUser);

  if (loading) return <Spinner />;
  if (!mine) {
    return (
      <Card>
        <CardHeader title="My Profile" />
        <EmptyState title="No staff profile linked" hint="Ask your admin to link your user account to a staff record." />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="My Profile" subtitle={mine.designation} />
      <div className="p-5 flex items-center gap-4">
        <Avatar src={mine.photo} name={mine.name} size={72} />
        <div>
          <div className="text-lg font-extrabold text-slate-900">{mine.name}</div>
          <div className="text-sm text-slate-600">{mine.department} · {mine.role === 'teacher' ? 'Teacher' : 'Staff'}</div>
          <div className="text-xs text-slate-500 mt-1">{mine.phone} · {mine.email}</div>
          <div className="mt-1.5">
            <Badge tone={mine.isActive ? 'green' : 'red'}>{mine.isActive ? 'Active' : 'Inactive'}</Badge>
          </div>
        </div>
      </div>
    </Card>
  );
};

/** Editable profile tab with photo upload. */
const ProfileTab: React.FC = () => {
  const { currentUser } = useAuth();
  const { mine, loading } = useMyStaff(currentUser);
  const [msg, setMsg] = useState('');
  const [photo, setPhoto] = useState<string | undefined>(undefined);

  const current = mine ? { ...mine, photo: photo ?? mine.photo } : null;

  const onPhotoChange = async (url: string) => {
    setPhoto(url);
    if (!mine) return;
    try {
      await updateDoc(doc(db, 'staff', mine.id), { photo: url });
      setMsg('Photo updated.');
    } catch (e: any) {
      // Note: firestore rules grant staff write = admin/principal only.
      // If self-update is denied, the photo still uploads to Storage.
      setMsg(e?.message || 'Photo uploaded, but saving to your profile was denied.');
    }
  };

  if (loading) return <Spinner />;
  if (!mine || !current) {
    return (
      <Card>
        <CardHeader title="My Profile" />
        <EmptyState title="No staff profile linked" hint="Ask your admin to link your user account to a staff record." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="My Profile" subtitle="Your staff record." />
      <div className="p-5 space-y-4 max-w-md">
        {msg && (
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700">{msg}</div>
        )}
        <div className="flex items-center gap-4">
          <Avatar src={current.photo} name={current.name} size={72} />
          <div>
            <div className="text-lg font-extrabold text-slate-900">{current.name}</div>
            <div className="text-sm text-slate-600">{current.designation}</div>
          </div>
        </div>
        <ImageUploadField
          recordId={mine.id}
          value={current.photo}
          onChange={onPhotoChange}
          label="Profile photo"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-xs font-semibold text-slate-500 block">Phone</span>{current.phone || '—'}</div>
          <div><span className="text-xs font-semibold text-slate-500 block">Email</span>{current.email || '—'}</div>
          <div><span className="text-xs font-semibold text-slate-500 block">Department</span>{current.department || '—'}</div>
          <div><span className="text-xs font-semibold text-slate-500 block">Joining date</span>{current.joiningDate || '—'}</div>
        </div>
      </div>
    </Card>
  );
};

export const StaffDashboard: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  // Navigation lives in the sidebar / hamburger drawer; the tab mirrors the
  // selected nav item (Shell remounts on nav change via key).
  const tab = initialTab || 'overview';

  return (
    <div>
      {tab === 'overview' && (
        <div className="space-y-5">
          <ProfileCard />
          <Card>
            <CardHeader title="Latest Notices" />
            <div className="p-5"><NoticeList limit={5} /></div>
          </Card>
        </div>
      )}
      {tab === 'myattendance' && <StaffAttendance selfView />}
      {tab === 'notices' && (
        <Card>
          <CardHeader title="Notices" subtitle="Announcements from the school office." />
          <div className="p-5"><NoticeList /></div>
        </Card>
      )}
      {tab === 'profile' && <ProfileTab />}
    </div>
  );
};
