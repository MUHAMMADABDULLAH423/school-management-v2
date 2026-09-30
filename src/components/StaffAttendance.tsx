import React, { useMemo, useState } from 'react';
import { Clock, MapPin, Save } from 'lucide-react';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useCollection, useSchool } from '../hooks/useFirestore';
import { AttendanceRecord, AttendanceStatus, StaffMember, todayStr } from '../types';
import { distanceMeters, getCurrentPosition, geoErrorMessage, hasGpsFence } from '../utils/geo';
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
  const { school } = useSchool();

  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInMsg, setCheckInMsg] = useState('');
  const [checkInOk, setCheckInOk] = useState(false);

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

  /* ---------- self check-in (teacher/staff): location-gated ---------- */
  const checkIn = async () => {
    if (!currentUser || !myStaffId || checkInBusy) return;
    setCheckInBusy(true);
    setCheckInMsg('');
    setCheckInOk(false);
    try {
      const gps = school?.gpsLocation;
      const fenced = hasGpsFence(gps);
      let lat: number | undefined;
      let lng: number | undefined;
      let dist: number | undefined;

      if (fenced && gps) {
        const pos = await getCurrentPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        dist = Math.round(distanceMeters(lat, lng, Number(gps.lat), Number(gps.lng)));
        const radius = Number(gps.radius) || 100;
        if (dist > radius) {
          setCheckInMsg(
            `You are ${dist} m away from the school (allowed radius ${radius} m). ` +
            `Check-in blocked — please move inside the school premises and try again.`
          );
          return;
        }
      }

      const today = todayStr();
      await setDoc(doc(db, 'attendance', `${today}_${myStaffId}`), {
        type: 'staff',
        staffId: myStaffId,
        status: 'Present',
        date: today,
        checkInTime: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        markedBy: currentUser.name,
        ...(lat !== undefined ? { checkInLat: lat, checkInLng: lng, distanceM: dist } : {}),
      }, { merge: true });
      await logAudit(currentUser.uid, currentUser.name, 'Self check-in',
        `Checked in on ${today}` + (dist !== undefined ? ` (${dist} m from school)` : ''));
      setCheckInOk(true);
      setCheckInMsg(
        fenced ? `Checked in successfully — you are ${dist} m from the school.` : 'Checked in successfully.'
      );
    } catch (e: any) {
      setCheckInMsg(geoErrorMessage(e));
    } finally {
      setCheckInBusy(false);
    }
  };

  /* ---------- self view (teacher/staff role): check-in + own records ---------- */
  if (selfView) {
    if (loadingRecords) return <Spinner />;
    if (!myStaffId) {
      return <Card><CardHeader title="My Attendance" /><EmptyState title="No staff profile linked" hint="Ask your admin to link your user account to a staff record." /></Card>;
    }
    const todayRec = myRecords.find((r) => r.date === todayStr());
    const fenced = hasGpsFence(school?.gpsLocation);
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader title="My Attendance" subtitle="Check in when you arrive at school." />
          <div className="p-5">
            {todayRec ? (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <Badge tone={statusTone(todayRec.status)}>{todayRec.status}</Badge>
                <div className="text-sm text-emerald-800">
                  <span className="font-bold">Already marked for today</span>
                  {todayRec.checkInTime && <span> · checked in at {todayRec.checkInTime}</span>}
                  {todayRec.distanceM !== undefined && <span> · {todayRec.distanceM} m from school</span>}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-xs text-indigo-800">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {fenced
                      ? `Location-verified check-in: you must be within ${school?.gpsLocation?.radius || 100} m of the school. Your location is checked when you press the button.`
                      : 'School location is not configured yet — check-in is currently open. Ask the principal to set the GPS location in School Profile.'}
                  </span>
                </div>
                {checkInMsg && (
                  <div className={`px-4 py-3 rounded-xl text-sm border ${checkInOk
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    {checkInMsg}
                  </div>
                )}
                <PrimaryButton type="button" onClick={checkIn} disabled={checkInBusy} className="w-full sm:w-auto">
                  <Clock className="w-4 h-4" />
                  {checkInBusy ? 'Getting your location…' : 'Check In'}
                </PrimaryButton>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Attendance History" pill={`${myRecords.length} records`} />
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
      </div>
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
