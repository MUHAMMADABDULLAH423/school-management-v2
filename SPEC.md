# School Management System v2 — Build Spec

Rebuild of ZIP 1 ("School Management System") with requested improvements.
Stack: React 19 + Vite + TypeScript + Tailwind CSS v4 + Firebase (Auth email/password, Firestore, Storage).

## Roles
`principal | admin | teacher | staff | parent`

## Permission matrix (MUST be enforced in UI *and* in firestore.rules)

| Action | principal | admin | teacher | staff | parent |
|---|---|---|---|---|---|
| Executive dashboard | ✅ | ✅ (admin view) | ❌ | ❌ | ❌ |
| Add/edit/deactivate teacher | ✅ | ✅ | ❌ | ❌ | ❌ |
| Add/edit/deactivate non-teaching staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Student admission (add/edit) | ❌ NEVER | ✅ | ❌ | ❌ | ❌ |
| Add/edit parent users | ❌ | ✅ | ❌ | ❌ | ❌ |
| School profile (name/address/contact) | ✅ edit | ✅ edit | ❌ | ❌ | ❌ |
| Bank accounts CRUD | ✅ | ✅ | ❌ | ❌ | ❌ |
| Fee vouchers: generate/collect | ❌ view only | ✅ | ❌ | ❌ | view own |
| Mark student attendance | ❌ | ✅ | ✅ own classes | ❌ | ❌ |
| Diary / homework | ❌ | ✅ | ✅ | ❌ | view |
| Marks entry | ❌ | ✅ | ✅ | ❌ | view own child |
| Timetable manage | ❌ | ✅ | view | ❌ | ❌ |
| Salary / expenses | view | ✅ | ❌ | ❌ | ❌ |
| Audit log | view | ✅ view | ❌ | ❌ | ❌ |

Key rule: **principal can NEVER create/edit/delete students or parent users.**
Principal CAN create users only with role `teacher` or `staff`. Admin can create any role.
Nobody can change their own role (rules enforce).

## Requested features (the 4 asks)

### 1. Executive dashboard (principal) — ZIP 2 style
- `DateFilter`: modes = single date | date range | month chips (last 6 months). Every section below reacts to it.
- KPI cards row: Total Students, Total Teachers, Total Staff, Today's Attendance %, Fee Collected, Fee Pending, Collection Rate %.
- `FeeOverview`: billed vs collected vs pending, collection-rate progress bar, status filter tabs (All/Paid/Partial/Pending/Defaulter), voucher table (voucher no, student, class, month, total, paid, due, status), button "Open Fee Center" → fees view (admin only; principal sees read-only).
- `AttendanceRoster`: student attendance table for the filtered date(s) with filters: status (All/Present/Absent/Late), class dropdown, search by name/roll. Shows counts + attendance rate.
- Staff attendance summary strip (present/late/absent counts).
- Visual style (mirror ZIP 2): white `rounded-2xl border border-slate-200` cards, section headers with title + filter-label pill + subtitle, small shadow, slate/emerald/rose/amber color coding, lucide icons.

### 2. Principal → add teacher/staff (NOT students)
- `StaffManager` (used by principal AND admin): table of teachers + non-teaching staff with photo avatar, search, role filter.
- Add/Edit modal: name, email, phone, role (teacher|staff), designation, department, qualification, subjects (multi), assigned classes (multi), salary, joining date, **photo upload**.
- Deactivate (soft: isActive=false) — never hard delete.
- Principal's sidebar shows "Teachers & Staff" but NOT "Admissions/Students-add".

### 3. Principal → school profile + bank accounts
- `SchoolProfile`: edit school name, address, contact phone, email, affiliation, registration number, GPS location (lat/lng/radius), academic year.
- Bank accounts CRUD: bank name, account title, account number, branch, IBAN (optional), "Set as default" toggle. List with edit/delete.
- Bank accounts are used on fee vouchers (see 5).

### 4. Photo upload when adding teacher/staff/student
- `ImageUploadField`: file picker with preview circle, validates image type + max 2MB, uploads to Firebase Storage `profiles/{recordId}/{filename}`, returns downloadURL stored on the record (`photo`/`photoURL`).
- Used in: StaffManager modal, StudentAdmission form, profile pages.
- storage.rules: read = any signed-in user; write = admin/principal (or the user themself for own profile photo).

### 5. Fee voucher shows principal-managed bank account
- `FeeVoucherPrint`: 3-copy challan (Bank / School / Student). Header = school name + address from `schools/{id}` profile. Bank line = default bank account (`{bankName} — A/C {accountTitle}: {accountNumber}`), fallback "—" if none set.
- WhatsApp reminder button to parent (wa.me link), Print button (window.print with print CSS).

## Auth logic (keep ZIP 1's good behavior)
- Firebase `signInWithEmailAndPassword`; then read `users/{uid}`; role mismatch or inactive → sign out + error.
- 3 failed attempts → 15-minute lockout (localStorage keys `smsv2_lockout_until`, `smsv2_failed_attempts`).
- 30 minutes inactivity → auto logout.
- `isFirstLogin` → forced password-change modal before entering app.
- Audit log entries: login, logout, failed login, password change.

## Firestore data model

```
schools/{schoolId}
  name, address, contact, email, affiliation?, registrationNumber?,
  bankAccounts: [{id, bankName, accountTitle, accountNumber, branch, iban?, isDefault}],
  gpsLocation: {lat, lng, radius}, academicYear, createdAt

users/{uid}
  name, email, role, photoURL?, phone?, schoolId, staffId?, isActive, isFirstLogin, createdAt

students/{id}
  name, photo?, class, section, rollNumber, dob, gender, address,
  parentId?, parentName, parentPhone, parentWhatsApp, parentEmail,
  feeStatus: Paid|Pending|Partial|Defaulter, isActive, academicYear, createdAt

staff/{id}
  name, photo?, email, phone, role: teacher|staff, designation, department,
  qualification?, subjects[], assignedClasses[], salary?, joiningDate,
  userId? (link to users doc), isActive, createdAt

classes/{id}      {name, section, subjects[], academicYear}
attendance/{id}  {type: student|staff, studentId?, staffId?, status: Present|Absent|Late|HalfDay|Leave, date: YYYY-MM-DD, checkInTime?, markedBy, classSection?}
fees/{id}        {studentId, voucherNumber, month, tuitionFee, transportFee, examFee, lateFine, totalAmount, paidAmount, dueAmount, status: Paid|Partial|Pending|Defaulter, dueDate, paidDate?, receiptNo?, bankSnapshot?}
results/{id}     {studentId, subject, examType, totalMarks, obtainedMarks, grade, classSection, date, enteredBy}
exams/{id}       {name, term, startDate, endDate, classes[], academicYear}
timetable/{id}   {classSection, day, period, time, subject, teacherId?, teacherName, room?}
diary/{id}       {teacherId, classSection, date, content, homework[]}
notifications/{id} {title, body, audience: all|role|user, toRole?, toUserId?, date, createdBy}
holidays/{id}    {name, date, description}
expenses/{id}    {title, amount, category, date, addedBy}
salary/{id}      {staffId, month, basicPay, allowances, deductions, netPay, status: Paid|Pending, paidDate?}
auditLog/{id}    {userId, userName, action, category, details, timestamp}  // append-only
```

## Firestore rules — critical constraints
- `isPrincipal()`, `isAdmin()`, `isTeacher()`, `isStaff()`, `isParent()` read role from `users/{uid}`.
- `schools`: get/list = signed in; write = principal or admin.
- `users/{uid}` create: admin → any role; principal → ONLY role in [teacher, staff]; nobody else. Update: admin → any (but cannot be demoted below? keep simple: admin full); principal → only docs with role teacher/staff, limited fields (name, phone, photoURL, isActive, staffId); user → own doc limited fields (name, phone, photoURL). **Rule: `request.resource.data.role == resource.data.role` unless admin** (no self-promotion).
- `students`: get/list = admin, teacher, staff?, principal (read), parent (own children via parentId). **create/update/delete = admin ONLY.**
- `staff`: get/list = signed in; create/update = admin OR principal; delete = admin only.
- `fees`: read = admin, principal, parent (own child); write = admin only.
- `attendance`: create = teacher (students of own classes — enforce loosely via role), admin; staff self check-in allowed for own staffId; read = signed in (scoped in UI).
- `results`: read = admin, teacher, principal, parent (own child); write = admin, teacher.
- `timetable`, `diary`, `exams`, `holidays`, `notifications`, `expenses`, `salary`: read = signed in; write = admin (diary/timetable also teacher for own).
- `auditLog`: create = signed in AND `request.resource.data.userId == request.auth.uid`; update/delete = false; read = admin, principal.

## Storage rules
```
match /profiles/{recordId}/{fileName} {
  allow read: if request.auth != null;
  allow write: if isAdmin() || isPrincipal();
}
```

## File layout (src/)
```
main.tsx, App.tsx, index.css
config/firebase.ts        — initializeApp with PLACEHOLDER config; exports auth, db, storage
context/AuthContext.tsx   — session, lockout, inactivity, first-login, audit hooks
types/index.ts            — all interfaces above
services/seed.ts          — generateDemoData(): realistic Pakistani demo school; admin-triggered "Load demo data"
components/
  ui.tsx                  — Card, StatCard, Modal, Field (label+input), Select, TextArea, Badge, Tabs, EmptyState, Spinner, Avatar, ConfirmDialog, SearchInput
  Login.tsx
  Guards.tsx              — <RequireRole roles={[...]}> wrapper
  Sidebar.tsx             — role-based nav items, school name header, logout
  Header.tsx              — top bar: date-filter slot?, user chip, photo
  ImageUploadField.tsx
  DateFilter.tsx          — {mode, singleDate, startDate, endDate, selectedMonths}, onChange
  FeeOverview.tsx         — props: fees, students, filterLabel, onOpenFees?
  AttendanceRoster.tsx    — props: records, students, filterLabel
  ExecutiveDashboard.tsx  — composes DateFilter + KPIs + FeeOverview + AttendanceRoster + staff strip
  StaffManager.tsx        — table + add/edit modal + photo (principal & admin)
  SchoolProfile.tsx       — profile form + bank accounts CRUD (principal & admin)
  StudentAdmission.tsx    — admission form + photo (admin only)
  UserManager.tsx         — users table, reset password, deactivate (admin only)
  FeesManager.tsx         — voucher list, generate voucher, collect payment, print (admin; principal read-only view)
  FeeVoucherPrint.tsx     — 3-copy challan, dynamic school + bank
  AttendanceManager.tsx   — mark student attendance by class/date (teacher, admin)
  StaffAttendance.tsx     — staff attendance register (admin; staff self view)
  DiaryManager.tsx        — diary/homework (teacher; parent view)
  MarksManager.tsx        — marks entry + results (teacher, admin; parent view own)
  TimetableManager.tsx    — weekly grid (admin edit; others view)
  NoticesManager.tsx      — notices CRUD (admin; all view)
  HolidaysManager.tsx
  ExpensesManager.tsx     — (admin; principal view)
  SalaryManager.tsx       — (admin; principal view)
  AuditLogView.tsx        — (admin, principal)
dashboards/
  PrincipalDashboard.tsx  — tabs: Executive Overview | Teachers & Staff | School Profile | (read-only: Fees, Attendance, Audit)
  AdminDashboard.tsx      — tabs: Overview | Admissions | Students | Teachers & Staff | Users | Fees | Attendance | Academics | Notices | Finance | Audit
  TeacherDashboard.tsx    — tabs: My Classes | Attendance | Diary | Marks | Timetable | Notices
  StaffDashboard.tsx      — tabs: Overview | My Attendance | Notices | Profile
  ParentDashboard.tsx     — tabs: My Children | Attendance | Results | Fees | Diary | Notices
```

## Conventions
- No react-router: `App.tsx` holds `currentUser`; each dashboard holds `activeTab` state; Sidebar calls `onNavigate(tab)`.
- All Firestore access: import { db } from '../config/firebase'; use firebase/firestore functions directly.
- Dates: attendance/fees filter on `YYYY-MM-DD` strings; months as `YYYY-MM`.
- Currency: PKR formatting via `toLocaleString('en-PK')`.
- Never hardcode school name/bank: always read from `schools/main` doc (single-school app, doc id `main` — created by seed or first-run setup).
- First-run: if `schools/main` missing, principal sees setup wizard (SchoolProfile form) before dashboard.
- No real credentials anywhere: firebase.ts has placeholders + README explains where to paste config.
- Print CSS: `@media print` hides app chrome (`.print:hidden` via Tailwind), voucher prints cleanly.

## Seed data (services/seed.ts)
School: "Greenwood High School", address "Main Boulevard, Gulberg, Lahore", contact, 1 default bank account (Meezan Bank demo).
Users: principal (principal@greenwood.pk), admin (admin@greenwood.pk), 3 teachers, 2 staff, 2 parents — NOTE: seed creates Firestore docs; actual Auth accounts must be created in Firebase console (document in README). Password for docs: isFirstLogin=true so they must set password on first login.
Students: ~36 across classes 6–10 (A/B), parents linked, fee vouchers for current month (mixed Paid/Partial/Pending), today's attendance (seeded for demo date), one exam "First Term" with results.
Keep seed idempotent: skip if students collection non-empty.
