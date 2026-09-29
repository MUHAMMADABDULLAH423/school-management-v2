/**
 * Demo seed data for School Management System v2.
 *
 * Creates a realistic Pakistani demo school ("Greenwood High School") in
 * Firestore. Idempotent: if the `students` collection is non-empty, seeding
 * is skipped.
 *
 * IMPORTANT: this creates Firestore *documents* only. The matching Firebase
 * Authentication accounts must be created manually in
 * Firebase Console → Authentication → Add user (see SEED_AUTH_ACCOUNTS below).
 * Seeded users have isFirstLogin=true so they are forced to set a new
 * password on first sign-in.
 */
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { gradeFor,
  monthStr,
  todayStr,
  type AttendanceRecord,
  type AuditLogEntry,
  type BankAccount,
  type ClassSection,
  type DiaryEntry,
  type Exam,
  type ExamResult,
  type FeeStatus,
  type FeeVoucher,
  type HolidayItem,
  type NotificationItem,
  type SchoolProfile,
  type StaffMember,
  type Student,
  type TimetableSlot,
  type UserProfile,
  type UserRole,
  pendingUserDocId,
} from '../types';

/** The 8 demo login accounts. Create each in Firebase Console → Authentication → Add user. */
export const SEED_AUTH_ACCOUNTS: { email: string; role: UserRole; note: string }[] = [
  { email: 'principal@greenwood.pk', role: 'principal', note: 'Principal — executive dashboard, teachers & staff, school profile' },
  { email: 'admin@greenwood.pk', role: 'admin', note: 'Admin — full control including admissions and fees' },
  { email: 'teacher1@greenwood.pk', role: 'teacher', note: 'Sana Malik — Mathematics (classes 8-A, 9-A)' },
  { email: 'teacher2@greenwood.pk', role: 'teacher', note: 'Usman Tariq — English (classes 6-A, 7-A)' },
  { email: 'teacher3@greenwood.pk', role: 'teacher', note: 'Hina Shahid — Science (classes 6-B, 9-A, 10-A)' },
  { email: 'staff1@greenwood.pk', role: 'staff', note: 'Imran Yousuf — Accountant' },
  { email: 'parent1@greenwood.pk', role: 'parent', note: 'Rashid Mehmood — father of Ahmed Rashid (8-A)' },
  { email: 'parent2@greenwood.pk', role: 'parent', note: 'Farzana Aslam — mother of Fatima Noor (9-A)' },
];

/* ------------------------------- helpers ------------------------------- */

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Deterministic demo phone number from an index. */
const phoneFor = (i: number): string =>
  `03${pad2(21 + ((i * 7) % 79))}-${String(1000000 + ((i * 7919) % 8999999)).slice(0, 7)}`;

const whatsAppFor = (i: number): string => phoneFor(i).replace('-', '');

/** Deterministic pseudo-random int in [min, max] from an index. */
const pickInRange = (i: number, min: number, max: number, salt = 13): number =>
  min + ((i * 7919 + salt * 104729) % (max - min + 1));

/* ------------------------------- builders ------------------------------ */

function buildSchool(now: string): SchoolProfile {
  const bank: BankAccount = {
    id: 'bank1',
    bankName: 'Meezan Bank',
    accountTitle: 'Greenwood High School',
    accountNumber: '0123-0104567890',
    branch: 'Gulberg Branch, Lahore',
    iban: 'PK36MEZN0001230104567890',
    isDefault: true,
  };
  return {
    id: 'main',
    name: 'Greenwood High School',
    address: 'Main Boulevard, Gulberg III, Lahore',
    contact: '042-35771234',
    email: 'info@greenwood.pk',
    affiliation: 'BISE Lahore',
    registrationNumber: 'GHS-7821',
    bankAccounts: [bank],
    gpsLocation: { lat: 31.5204, lng: 74.3587, radius: 150 },
    academicYear: '2026-27',
    createdAt: now,
  };
}

function buildUsers(now: string): { id: string; doc: UserProfile }[] {
  const rows: Array<[string, string, string, UserRole, (string | undefined)?, (string | undefined)?]> = [
    ['usr-principal-1', 'Ayesha Khan', 'principal@greenwood.pk', 'principal', undefined, '0300-1112233'],
    ['usr-admin-1', 'Bilal Ahmed', 'admin@greenwood.pk', 'admin', undefined, '0300-2223344'],
    ['usr-teacher-1', 'Sana Malik', 'teacher1@greenwood.pk', 'teacher', 'stf-t1', '0300-3334455'],
    ['usr-teacher-2', 'Usman Tariq', 'teacher2@greenwood.pk', 'teacher', 'stf-t2', '0300-4445566'],
    ['usr-teacher-3', 'Hina Shahid', 'teacher3@greenwood.pk', 'teacher', 'stf-t3', '0300-5556677'],
    ['usr-staff-1', 'Imran Yousuf', 'staff1@greenwood.pk', 'staff', 'stf-s1', '0300-6667788'],
    ['usr-parent-1', 'Rashid Mehmood', 'parent1@greenwood.pk', 'parent', undefined, '0301-4567890'],
    ['usr-parent-2', 'Farzana Aslam', 'parent2@greenwood.pk', 'parent', undefined, '0302-9876543'],
  ];
  return rows.map(([_id, name, email, role, staffId, phone]) => {
    const id = pendingUserDocId(email);
    return {
    id,
    doc: {
      uid: id,
      name,
      email,
      role,
      schoolId: 'main',
      ...(staffId ? { staffId } : {}),
      ...(phone ? { phone } : {}),
      isActive: true,
      isFirstLogin: true,
      createdAt: now,
    },
  };
  });
}

function buildStaff(now: string): { id: string; doc: StaffMember }[] {
  const rows: Array<Omit<StaffMember, 'createdAt'> & { id: string }> = [
    {
      id: 'stf-t1', name: 'Sana Malik', email: 'teacher1@greenwood.pk', phone: '0300-3334455',
      role: 'teacher', designation: 'Senior Mathematics Teacher', department: 'Mathematics',
      qualification: 'M.Sc Mathematics, University of the Punjab',
      subjects: ['Mathematics'], assignedClasses: ['8-A', '9-A'],
      salary: 85000, joiningDate: '2022-04-01', userId: 'usr-teacher-1', isActive: true,
    },
    {
      id: 'stf-t2', name: 'Usman Tariq', email: 'teacher2@greenwood.pk', phone: '0300-4445566',
      role: 'teacher', designation: 'English Language Teacher', department: 'English',
      qualification: 'M.A English, University of Lahore',
      subjects: ['English', 'Urdu'], assignedClasses: ['6-A', '6-B', '7-A'],
      salary: 78000, joiningDate: '2023-08-15', userId: 'usr-teacher-2', isActive: true,
    },
    {
      id: 'stf-t3', name: 'Hina Shahid', email: 'teacher3@greenwood.pk', phone: '0300-5556677',
      role: 'teacher', designation: 'Science Teacher', department: 'Science',
      qualification: 'M.Sc Physics, LUMS',
      subjects: ['Science', 'Physics', 'Chemistry'], assignedClasses: ['6-B', '9-A', '10-A'],
      salary: 82000, joiningDate: '2022-09-01', userId: 'usr-teacher-3', isActive: true,
    },
    {
      id: 'stf-s1', name: 'Imran Yousuf', email: 'staff1@greenwood.pk', phone: '0300-6667788',
      role: 'staff', designation: 'Accountant', department: 'Accounts',
      qualification: 'B.Com, Hailey College of Commerce',
      subjects: [], assignedClasses: [],
      salary: 60000, joiningDate: '2021-01-10', userId: 'usr-staff-1', isActive: true,
    },
  ];
  return rows.map((r) => ({ id: r.id, doc: { ...r, createdAt: now } }));
}

function buildClasses(): ClassSection[] {
  const common = ['English', 'Urdu', 'Mathematics', 'Science', 'Islamiat', 'Computer'];
  return [
    { id: 'cls-6-a', name: '6', section: 'A', subjects: common, academicYear: '2026-27' },
    { id: 'cls-6-b', name: '6', section: 'B', subjects: common, academicYear: '2026-27' },
    { id: 'cls-7-a', name: '7', section: 'A', subjects: common, academicYear: '2026-27' },
    { id: 'cls-8-a', name: '8', section: 'A', subjects: ['English', 'Urdu', 'Mathematics', 'Science', 'Islamiat', 'Nazra Quran'], academicYear: '2026-27' },
    { id: 'cls-9-a', name: '9', section: 'A', subjects: ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology'], academicYear: '2026-27' },
    { id: 'cls-10-a', name: '10', section: 'A', subjects: ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology'], academicYear: '2026-27' },
  ];
}

interface StudentSeed {
  name: string;
  gender: 'Male' | 'Female';
  cls: string;
  section: string;
  parentName: string;
  parentId?: string;
}

function buildStudents(now: string): { id: string; doc: Student }[] {
  const seeds: StudentSeed[] = [
    // 6-A
    { name: 'Ali Hassan', gender: 'Male', cls: '6', section: 'A', parentName: 'Tariq Mehmood' },
    { name: 'Mahnoor Fatima', gender: 'Female', cls: '6', section: 'A', parentName: 'Shahid Imran' },
    { name: 'Daniyal Raza', gender: 'Male', cls: '6', section: 'A', parentName: 'Raza Hussain' },
    { name: 'Zara Imran', gender: 'Female', cls: '6', section: 'A', parentName: 'Imran Farooq' },
    // 6-B
    { name: 'Hamza Tariq', gender: 'Male', cls: '6', section: 'B', parentName: 'Tariq Aziz' },
    { name: 'Areeba Khalid', gender: 'Female', cls: '6', section: 'B', parentName: 'Khalid Mehmood' },
    { name: 'Fahad Noor', gender: 'Male', cls: '6', section: 'B', parentName: 'Noor Elahi' },
    { name: 'Iqra Saleem', gender: 'Female', cls: '6', section: 'B', parentName: 'Saleem Akhtar' },
    // 7-A
    { name: 'Bilal Aslam', gender: 'Male', cls: '7', section: 'A', parentName: 'Aslam Pervez' },
    { name: 'Saba Farooq', gender: 'Female', cls: '7', section: 'A', parentName: 'Farooq Ahmed' },
    { name: 'Usama Javed', gender: 'Male', cls: '7', section: 'A', parentName: 'Javed Iqbal' },
    { name: 'Hira Nawaz', gender: 'Female', cls: '7', section: 'A', parentName: 'Nawaz Sharif' },
    // 8-A
    { name: 'Ahmed Rashid', gender: 'Male', cls: '8', section: 'A', parentName: 'Rashid Mehmood', parentId: pendingUserDocId('parent1@greenwood.pk') },
    { name: 'Maryam Siddiqui', gender: 'Female', cls: '8', section: 'A', parentName: 'Adeel Siddiqui' },
    { name: 'Saad Mehmood', gender: 'Male', cls: '8', section: 'A', parentName: 'Mehmood Akram' },
    { name: 'Ayesha Raza', gender: 'Female', cls: '8', section: 'A', parentName: 'Raza Qadir' },
    // 9-A
    { name: 'Fatima Noor', gender: 'Female', cls: '9', section: 'A', parentName: 'Farzana Aslam', parentId: pendingUserDocId('parent2@greenwood.pk') },
    { name: 'Abdullah Khan', gender: 'Male', cls: '9', section: 'A', parentName: 'Sajid Khan' },
    { name: 'Nimra Shahid', gender: 'Female', cls: '9', section: 'A', parentName: 'Shahid Latif' },
    { name: 'Talha Yousuf', gender: 'Male', cls: '9', section: 'A', parentName: 'Yousuf Raza' },
    // 10-A
    { name: 'Hassan Ali', gender: 'Male', cls: '10', section: 'A', parentName: 'Ali Raza' },
    { name: 'Sana Aslam', gender: 'Female', cls: '10', section: 'A', parentName: 'Aslam Bhatti' },
    { name: 'Omar Farooq', gender: 'Male', cls: '10', section: 'A', parentName: 'Farooq Malik' },
    { name: 'Rabia Tariq', gender: 'Female', cls: '10', section: 'A', parentName: 'Tariq Javed' },
  ];

  const feeMix: FeeStatus[] = ['Paid', 'Partial', 'Pending'];
  return seeds.map((s, i) => {
    const id = `std-2026-${String(i + 1).padStart(3, '0')}`;
    const rollNumber = `2026-${String(i + 1).padStart(3, '0')}`;
    const birthYear = 2010 + (10 - parseInt(s.cls, 10)); // class 10 → 2010, class 6 → 2014
    const dob = `${birthYear}-${pad2(1 + (i % 12))}-${pad2(1 + ((i * 3) % 28))}`;
    const parentPhone = phoneFor(i + 100);
    const isLinked = !!s.parentId;
    return {
      id,
      doc: {
        id,
        name: s.name,
        class: s.cls,
        section: s.section,
        rollNumber,
        dob,
        gender: s.gender,
        address: `${(i % 9) + 1}-C, Model Town, Lahore`,
        ...(isLinked ? { parentId: s.parentId as string } : {}),
        parentName: s.parentName,
        parentPhone,
        parentWhatsApp: whatsAppFor(i + 100),
        parentEmail: isLinked
          ? s.parentId === pendingUserDocId('parent1@greenwood.pk')
            ? 'parent1@greenwood.pk'
            : 'parent2@greenwood.pk'
          : `${s.parentName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        feeStatus: feeMix[i % 3],
        isActive: true,
        academicYear: '2026-27',
        createdAt: now,
      } satisfies Student,
    };
  });
}

function buildAttendance(students: { id: string }[], today: string): { id: string; doc: AttendanceRecord }[] {
  const out: { id: string; doc: AttendanceRecord }[] = [];
  // Student attendance: deterministic ~90% present (i%20==18 → Late, i%20==19 → Absent)
  students.forEach((s, i) => {
    const r = i % 20;
    const status: AttendanceRecord['status'] = r === 18 ? 'Late' : r === 19 ? 'Absent' : 'Present';
    const id = `att-${today}-${s.id}`;
    out.push({
      id,
      doc: {
        id,
        type: 'student',
        studentId: s.id,
        status,
        date: today,
        markedBy: 'usr-teacher-1',
      },
    });
  });
  // Staff attendance: everyone present with staggered check-in
  const staffIds = ['stf-t1', 'stf-t2', 'stf-t3', 'stf-s1'];
  staffIds.forEach((staffId, i) => {
    const id = `att-${today}-${staffId}`;
    out.push({
      id,
      doc: {
        id,
        type: 'staff',
        staffId,
        status: 'Present',
        date: today,
        checkInTime: `08:0${(i % 6) + 1} AM`,
        markedBy: 'usr-admin-1',
      },
    });
  });
  return out;
}

function buildFees(
  students: { id: string; doc: Student }[],
  month: string,
): { id: string; doc: FeeVoucher }[] {
  const statusMix: FeeStatus[] = ['Paid', 'Partial', 'Pending'];
  return students.map((s, i) => {
    const id = `fee-${month}-${s.id}`;
    const tuitionFee = 5000;
    const transportFee = i % 2 === 0 ? 1500 : 0; // half the students use transport
    const examFee = 0;
    const lateFine = 0;
    const totalAmount = tuitionFee + transportFee + examFee + lateFine;
    const status = statusMix[i % 3];
    const paidAmount = status === 'Paid' ? totalAmount : status === 'Partial' ? Math.round(totalAmount / 2) : 0;
    const rollTail = s.doc.rollNumber.split('-')[1];
    const voucherNumber = `VCH-${month}-${rollTail}`;
    return {
      id,
      doc: {
        id,
        studentId: s.id,
        voucherNumber,
        month,
        tuitionFee,
        transportFee,
        examFee,
        lateFine,
        totalAmount,
        paidAmount,
        dueAmount: totalAmount - paidAmount,
        status,
        dueDate: `${month}-10`,
        ...(status !== 'Pending' ? { paidDate: `${month}-${pad2(3 + (i % 5))}` } : {}),
        ...(status === 'Paid' ? { receiptNo: `RCP-${month}-${rollTail}` } : {}),
        bankSnapshot: 'Meezan Bank — A/C Greenwood High School: 0123-0104567890',
        createdAt: new Date().toISOString(),
      },
    };
  });
}

function buildExam(now: Date): Exam {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  // "First Term Examination" ran last month: 1st → 20th of last month
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m - 1, 20);
  return {
    id: 'exam-term1',
    name: 'First Term Examination',
    term: 'Term 1',
    startDate: iso(start),
    endDate: iso(end),
    classes: ['6-A', '6-B', '7-A', '8-A', '9-A', '10-A'],
    academicYear: '2026-27',
  };
}

function buildResults(
  students: { id: string; doc: Student }[],
  exam: Exam,
  now: string,
): ExamResult[] {
  const class8A = students.filter((s) => s.doc.class === '8' && s.doc.section === 'A');
  return class8A.map((s, i) => {
    const obtainedMarks = pickInRange(i, 60, 95, 7);
    return {
      id: `res-8a-math-${s.id}`,
      studentId: s.id,
      subject: 'Mathematics',
      examType: 'Mid Term',
      totalMarks: 100,
      obtainedMarks,
      grade: gradeFor(obtainedMarks, 100),
      classSection: '8-A',
      date: exam.endDate,
      enteredBy: 'usr-teacher-1',
    } satisfies ExamResult;
  });
}

function buildTimetable(now: string): TimetableSlot[] {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const times = ['08:00–08:45', '08:45–09:30', '09:45–10:30', '10:30–11:15', '11:30–12:15', '12:15–13:00'];
  const periodPlan: Array<{ subject: string; teacherId: string; teacherName: string }> = [
    { subject: 'Mathematics', teacherId: 'usr-teacher-1', teacherName: 'Sana Malik' },
    { subject: 'English', teacherId: 'usr-teacher-2', teacherName: 'Usman Tariq' },
    { subject: 'Science', teacherId: 'usr-teacher-3', teacherName: 'Hina Shahid' },
    { subject: 'Urdu', teacherId: 'usr-teacher-2', teacherName: 'Usman Tariq' },
    { subject: 'Islamiat', teacherId: 'usr-teacher-1', teacherName: 'Sana Malik' },
    { subject: 'Computer', teacherId: 'usr-teacher-3', teacherName: 'Hina Shahid' },
  ];
  const out: TimetableSlot[] = [];
  days.forEach((day, d) => {
    // Rotate subjects each day so the week looks realistic
    periodPlan.forEach((p, period) => {
      const slot = periodPlan[(period + d) % periodPlan.length];
      out.push({
        id: `tt-8a-${day.slice(0, 3).toLowerCase()}-p${period + 1}`,
        classSection: '8-A',
        day,
        period: period + 1,
        time: times[period],
        subject: slot.subject,
        teacherId: slot.teacherId,
        teacherName: slot.teacherName,
        room: 'Room 8-A',
      });
    });
  });
  return out;
}

function buildDiary(today: string, now: string): DiaryEntry[] {
  return [
    {
      id: `diary-8a-${today}`,
      teacherId: 'usr-teacher-1',
      classSection: '8-A',
      date: today,
      content: 'Covered Chapter 5: Algebraic expressions — addition and subtraction of polynomials. Class participation was excellent.',
      homework: ['Exercise 5.2, Q1–Q10', 'Revise formulas for tomorrow’s quiz'],
    },
    {
      id: `diary-9a-${today}`,
      teacherId: 'usr-teacher-3',
      classSection: '9-A',
      date: today,
      content: 'Physics: Newton’s laws of motion with daily-life examples. Lab demonstration of inertia completed.',
      homework: ['Numericals 3.1–3.5', 'Draw labelled diagram of the inertia experiment'],
    },
  ];
}

function buildNotifications(today: string): NotificationItem[] {
  const month = today.slice(0, 7);
  return [
    {
      id: 'notif-welcome',
      title: 'Welcome to Greenwood High School portal',
      body: 'The new school management portal is live. Parents can view attendance, results, fee vouchers and homework from one place.',
      audience: 'all',
      date: today,
      createdBy: 'usr-admin-1',
    },
    {
      id: 'notif-fee-deadline',
      title: `Fee deadline reminder — ${month}`,
      body: `This is a gentle reminder that the fee for ${month} is due on ${month}-10. Please collect your voucher and pay on time to avoid a late fine.`,
      audience: 'role',
      toRole: 'parent',
      date: today,
      createdBy: 'usr-admin-1',
    },
  ];
}

function buildHolidays(now: Date): HolidayItem[] {
  const plus = (days: number): string => iso(new Date(now.getTime() + days * 86400000));
  return [
    { id: 'hol-sports-day', name: 'Annual Sports Day', date: plus(14), description: 'Inter-house athletics competition at the school ground. Parents are welcome.' },
    { id: 'hol-winter-break', name: 'Winter Break Begins', date: plus(45), description: 'School closes for winter vacations. Reopens after the announced break.' },
  ];
}

function buildAuditLog(now: string): AuditLogEntry {
  return {
    id: `audit-seed-${Date.now()}`,
    userId: 'system',
    userName: 'Seed Script',
    action: 'Demo data seeded',
    category: 'SEED',
    details: 'Seeded schools/main, 8 users, 4 staff, 6 classes, 24 students, attendance, fee vouchers, 1 exam, results, timetable, diary, notifications, holidays.',
    timestamp: now,
  };
}

/* --------------------------------- main ---------------------------------- */

export async function seedDemoData(): Promise<{ ok: boolean; message: string }> {
  try {
    // Idempotency: skip if any students already exist
    const existing = await getDocs(query(collection(db, 'students'), limit(1)));
    if (!existing.empty) {
      return { ok: false, message: 'Demo data already exists' };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const today = todayStr();
    const month = monthStr(now);

    const batch = writeBatch(db);
    const put = <T extends object>(coll: string, id: string, data: T): void => {
      batch.set(doc(db, coll, id), data);
    };

    // 1. School
    const school = buildSchool(nowIso);
    put('schools', 'main', school);

    // 2. Users
    for (const u of buildUsers(nowIso)) put('users', u.id, u.doc);

    // 3. Staff
    for (const s of buildStaff(nowIso)) put('staff', s.id, s.doc);

    // 4. Classes
    for (const c of buildClasses()) put('classes', c.id, c);

    // 5. Students
    const students = buildStudents(nowIso);
    for (const s of students) put('students', s.id, s.doc);

    // 6. Attendance (today)
    for (const a of buildAttendance(students, today)) put('attendance', a.id, a.doc);

    // 7. Fee vouchers (current month)
    for (const f of buildFees(students, month)) put('fees', f.id, f.doc);

    // 8. Exam
    const exam = buildExam(now);
    put('exams', exam.id, exam);

    // 9. Results (8-A Mathematics Mid Term)
    for (const r of buildResults(students, exam, nowIso)) put('results', r.id, r);

    // 10. Timetable (8-A, Mon–Fri)
    for (const t of buildTimetable(nowIso)) put('timetable', t.id, t);

    // 11. Diary
    for (const d of buildDiary(today, nowIso)) put('diary', d.id, d);

    // 12. Notifications
    for (const n of buildNotifications(today)) put('notifications', n.id, n);

    // 13. Holidays
    for (const h of buildHolidays(now)) put('holidays', h.id, h);

    // 14. Audit log
    const audit = buildAuditLog(nowIso);
    put('auditLog', audit.id, audit);

    await batch.commit();

    return {
      ok: true,
      message:
        `Demo data seeded: ${students.length} students, 8 users, 4 staff, 6 classes, ` +
        `${buildTimetable(nowIso).length} timetable slots and fee vouchers for ${month}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
