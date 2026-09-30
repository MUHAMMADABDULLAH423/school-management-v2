/**
 * Core domain types — School Management System v2.
 * Firestore collection names: schools, users, students, staff, classes,
 * attendance, fees, results, exams, timetable, diary, notifications,
 * holidays, expenses, salary, auditLog.
 */

export type UserRole = 'principal' | 'admin' | 'teacher' | 'staff' | 'parent';

export interface BankAccount {
  id: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  branch: string;
  iban?: string;
  isDefault: boolean;
}

export interface SchoolProfile {
  id: string; // always "main" for single-school deployments
  name: string;
  address: string;
  contact: string;
  email: string;
  affiliation?: string;
  registrationNumber?: string;
  bankAccounts: BankAccount[];
  gpsLocation: { lat: number; lng: number; radius: number };
  academicYear: string;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL?: string;
  phone?: string;
  schoolId: string;
  staffId?: string;
  isActive: boolean;
  isFirstLogin: boolean;
  createdAt: string;
}

export type StaffRole = 'teacher' | 'staff';

export interface StaffMember {
  id: string;
  name: string;
  photo?: string;
  email: string;
  phone: string;
  role: StaffRole;
  designation: string;
  department: string;
  qualification?: string;
  subjects: string[];
  assignedClasses: string[];
  salary?: number;
  joiningDate: string;
  userId?: string;
  isActive: boolean;
  createdAt: string;
}

export type FeeStatus = 'Paid' | 'Partial' | 'Pending' | 'Defaulter';

export interface Student {
  id: string;
  name: string;
  photo?: string;
  class: string;
  section: string;
  rollNumber: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  parentId?: string;
  parentName: string;
  parentPhone: string;
  parentWhatsApp: string;
  parentEmail: string;
  feeStatus: FeeStatus;
  isActive: boolean;
  academicYear: string;
  createdAt: string;
}

export interface ClassSection {
  id: string;
  name: string;
  section: string;
  subjects: string[];
  academicYear: string;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'HalfDay' | 'Leave';

export interface AttendanceRecord {
  id: string;
  type: 'student' | 'staff';
  studentId?: string;
  staffId?: string;
  status: AttendanceStatus;
  date: string; // YYYY-MM-DD
  checkInTime?: string;
  markedBy: string;
  classSection?: string;
  /** Self check-in location audit (staff). */
  checkInLat?: number;
  checkInLng?: number;
  distanceM?: number;
}

export interface FeeVoucher {
  id: string;
  studentId: string;
  voucherNumber: string;
  month: string; // YYYY-MM
  tuitionFee: number;
  transportFee: number;
  examFee: number;
  lateFine: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: FeeStatus;
  dueDate: string;
  paidDate?: string;
  receiptNo?: string;
  /** Snapshot of the bank account printed on the voucher */
  bankSnapshot?: string;
  createdAt: string;
}

export interface ExamResult {
  id: string;
  studentId: string;
  subject: string;
  examType: string;
  totalMarks: number;
  obtainedMarks: number;
  grade: string;
  classSection: string;
  date: string;
  enteredBy: string;
}

export interface Exam {
  id: string;
  name: string;
  term: string;
  startDate: string;
  endDate: string;
  classes: string[];
  academicYear: string;
}

export interface TimetableSlot {
  id: string;
  classSection: string;
  day: string;
  period: number;
  time: string;
  subject: string;
  teacherId?: string;
  teacherName: string;
  room?: string;
}

export interface DiaryEntry {
  id: string;
  teacherId: string;
  classSection: string;
  date: string;
  content: string;
  homework: string[];
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'role' | 'user';
  toRole?: UserRole;
  toUserId?: string;
  date: string;
  createdBy: string;
}

export interface HolidayItem {
  id: string;
  name: string;
  date: string;
  description: string;
}

export interface ExpenseRecord {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  addedBy: string;
}

export interface SalaryRecord {
  id: string;
  staffId: string;
  month: string;
  basicPay: number;
  allowances: number;
  deductions: number;
  netPay: number;
  status: 'Paid' | 'Pending';
  paidDate?: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  category: string;
  details: string;
  timestamp: string;
}

/* ---------- Executive dashboard filter ---------- */

export type DateFilterMode = 'single' | 'range' | 'months';

export interface DateFilterState {
  mode: DateFilterMode;
  singleDate: string; // YYYY-MM-DD
  startDate: string;
  endDate: string;
  selectedMonths: string[]; // YYYY-MM
}

export const todayStr = (): string => new Date().toISOString().slice(0, 10);
export const monthStr = (d: Date = new Date()): string => d.toISOString().slice(0, 7);

export const defaultDateFilter = (): DateFilterState => {
  const t = todayStr();
  return { mode: 'single', singleDate: t, startDate: t, endDate: t, selectedMonths: [monthStr()] };
};

/** Does a YYYY-MM-DD date fall inside the filter? */
export function dateInFilter(date: string, f: DateFilterState): boolean {
  if (f.mode === 'single') return date === f.singleDate;
  if (f.mode === 'range') return date >= f.startDate && date <= f.endDate;
  return f.selectedMonths.some((m) => date.startsWith(m));
}

/** Does a YYYY-MM month fall inside the filter? */
export function monthInFilter(month: string, f: DateFilterState): boolean {
  if (f.mode === 'months') return f.selectedMonths.includes(month);
  const inRange = (d: string) => {
    if (f.mode === 'single') return d.startsWith(f.singleDate.slice(0, 7));
    return d.slice(0, 7) >= f.startDate.slice(0, 7) && d.slice(0, 7) <= f.endDate.slice(0, 7);
  };
  return inRange(month + '-01');
}

export const formatPKR = (n: number): string => `PKR ${Math.round(n).toLocaleString('en-PK')}`;

export const gradeFor = (obtained: number, total: number): string => {
  const p = total > 0 ? (obtained / total) * 100 : 0;
  if (p >= 90) return 'A+';
  if (p >= 80) return 'A';
  if (p >= 70) return 'B';
  if (p >= 60) return 'C';
  if (p >= 50) return 'D';
  if (p >= 40) return 'E';
  return 'F';
};

/**
 * Deterministic placeholder id for a users doc created by principal/admin
 * BEFORE the Firebase Auth login exists. Keyed by email so first-login
 * adoption needs only a direct document GET (no users-list permission).
 */
export const pendingUserDocId = (email: string): string =>
  `pending_${email.trim().toLowerCase()}`;

/**
 * Parent↔child linkage. `parentId` (auth uid) is the primary key; `parentEmail`
 * is the fallback so links made before the parent's first login keep working
 * after the placeholder users doc is adopted to the real auth uid.
 */
export function isOwnChild(
  s: { parentId?: string; parentEmail?: string },
  user: { uid: string; email: string } | null | undefined,
): boolean {
  if (!user) return false;
  if (s.parentId && s.parentId === user.uid) return true;
  const pe = (s.parentEmail || '').trim().toLowerCase();
  const ue = (user.email || '').trim().toLowerCase();
  return !!pe && !!ue && pe === ue;
}
