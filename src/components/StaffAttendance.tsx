import React, { useMemo, useState } from 'react';
import { Clock, Save } from 'lucide-react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { AttendanceRecord, AttendanceStatus, StaffMember, todayStr } from '../types';
import {
  Avatar, Badge, Card, CardHeader, EmptyState, Field, PrimaryButton, Select,
  Spinner, Table, TextInput,
} from './ui';

const STATUSES: AttendanceStatus[] = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];

const statusTone = (s: AttendanceStatus): 'green' | 'red' | 'amber' | 'blue' | 'violet' =>
  s === 'Present' ? 'green' : s === 'Absent' ? 'red' : s === 'Late' ? 'amber'
    : s === 'HalfDay' ? 'blue' : 'violet';

async function logAudit(uid: string, name: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId: uid, userName: name, action, category: 'ATTENDANCE',
      details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break UX */ }
}

/**
 * Staff attendance register (admin) — or read-only self view for staff role.
 * Doc id = `${date}_${staffId}`, type 'staff'.
 */
export const StaffAttendance: React.FC<{ selfView?: boolean }> = ({ selfView = false }) => {
  const { currentUser } = useAuth();
  const { data: staff, loading: loadingStaff } = useCollection<StaffMember>('staff');
  const { data: records, loading: loadingRecords } = useCollection<AttendanceRecord>('attendance');

  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const myStaffId = currentUser?.staffId;

  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [staff]
  );

  const myRecords = useMemo(() => {
    if (!myStaffId) return [];
    return records
      .filter((r) => r.type === 'staff' && r.staffId === myStaffId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60);
  }, [records, myStaffId]);

  const existingForDate = useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    records
      .filter((r) => r.type === 'staff' && r.date === date)
      .forEach((r) => { if (r.staffId) map[r.staffId] = r; });
    return map;
  }, [records, date]);

  const markOf = (id: string): AttendanceStatus =>
    marks[id] ?? existingForDate[id]?.status ?? 'Present';

  const save = async () => {
    if (!currentUser || activeStaff.length === 0) return;
    setSaving(true);
    setMsg('');
    try {
      for (const m of activeStaff) {
        const status = markOf(m.id);
        await setDoc(doc(db, 'attendance', `${date}_${m.id}`), {
          type: 'staff', staffId: m.id, status, date,
          checkInTime: status === 'Present' ? new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : undefined,
          markedBy: currentUser.name,
        }, { merge: true });
      }
      await logAudit(currentUser.uid, currentUser.name, 'Marked staff attendance',
        `${activeStaff.length} staff on ${date}`);
      setMarks({});
      setMsg(`Saved staff attendance for ${date}.`);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- self view (staff role): read-only own records ---------- */
  if (selfView) {
    if (loadingRecords) return <Spinner />;
    if (!myStaffId) {
      return <Card><CardHeader title="My Attendance" /><EmptyState title="No staff profile linked" hint="Ask your admin to link your user account to a staff record." /></Card>;
    }
    return (
      <Card>
        <CardHeader title="My Attendance" subtitle="Your attendance history (read-only)." pill={`${myRecords.length} records`} />
        <div className="p-5">
          {myRecords.length === 0 ? (
            <EmptyState title="No attendance records yet" />
          ) : (
            <Table head={['Date', 'Status', 'Check-in', 'Marked By']}>
              {myRecords.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{r.date}</td>
                  <td className="px-3 py-2"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="px-3 py-2 text-slate-600">{r.checkInTime || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.markedBy}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    );
  }

  /* ---------- admin register ---------- */
  if (loadingStaff || loadingRecords) return <Spinner />;

  return (
    <Card>
      <CardHeader
        title="Staff Attendance"
        subtitle="Daily register for teachers and non-teaching staff."
        pill={date}
        action={
          <PrimaryButton type="button" onClick={save} disabled={saving || activeStaff.length === 0}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Register'}
          </PrimaryButton>
        }
      />
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Field label="Date">
            <TextInput type="date" value={date} max={todayStr()} onChange={(e) => { setDate(e.target.value); setMarks({}); setMsg(''); }} />
          </Field>
        </div>
        {msg && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">{msg}</div>
        )}
        {activeStaff.length === 0 ? (
          <EmptyState title="No active staff" hint="Add teachers/staff via the Teachers & Staff tab." />
        ) : (
          <Table head={['Staff', 'Role', 'Saved', 'Status']}>
            {activeStaff.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={m.photo} name={m.name} size={32} />
                    <div>
                      <div className="font-semibold text-slate-900">{m.name}</div>
                      <div className="text-[11px] text-slate-500">{m.designation}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={m.role === 'teacher' ? 'blue' : 'slate'}>
                    {m.role === 'teacher' ? 'Teacher' : 'Staff'}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {existingForDate[m.id] ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <Clock className="w-3 h-3" /> {existingForDate[m.id].status}
                    </span>
                  ) : <span className="text-[11px] text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={markOf(m.id)}
                    onChange={(e) => setMarks((p) => ({ ...p, [m.id]: e.target.value as AttendanceStatus }))}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
};
