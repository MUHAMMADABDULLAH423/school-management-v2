# School Management System v2

Single-school management portal — React 19 + Vite + TypeScript + Tailwind CSS v4 + Firebase (Auth, Firestore, Storage).

## Roles

| Role | What they can do |
|---|---|
| **Principal** | Executive dashboard (KPIs, fee overview, attendance roster, date filters), add/manage **teachers & non-teaching staff** (with photo), manage school profile (name, address) and **bank accounts** (add/edit/delete, one default), read-only fee overview, audit log |
| **Admin** | Everything operational: **student admission** (only admin — principal can never admit students), users, fees (generate vouchers, collect payments, print challans), attendance, staff attendance, academics (diary/marks/timetable), notices, holidays, finance |
| **Teacher** | Mark student attendance, diary/homework, marks entry, timetable, notices |
| **Staff** | Own attendance history, notices, profile |
| **Parent** | Children, attendance, results, fee vouchers (print), diary, notices |

Key security rule (enforced in **both** UI and `firestore.rules`): **only admin can write student records** — principal has no admission UI and no student write permission at database level either.

## Setup

### 1. Firebase project
1. Create a project at [Firebase Console](https://console.firebase.google.com).
2. Enable **Authentication → Email/Password**.
3. Enable **Firestore Database** (production mode) and **Storage**.
4. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
   (install CLI: `npm i -g firebase-tools`, then `firebase login` / `firebase use <project>`)

### 2. App config
```bash
cp .env.example .env
```
Fill in your Firebase keys (`VITE_FIREBASE_API_KEY`, etc.) from Project Settings.

### 3. First principal (bootstrap)
1. In Firebase Console → **Authentication → Add user**: create the principal's login (email + temporary password).
2. In **Firestore → users → add document** with the **Auth UID as document ID**:
   - `name`, `email`, `role: "principal"`, `schoolId: "main"`, `isActive: true`, `isFirstLogin: true`
3. Sign in — the first-run wizard asks for school name/address and bank accounts.

### 4. Adding teachers / staff / parents (normal flow)
1. Principal (or admin) creates them in the app: **Teachers & Staff** (principal) or **Users** (admin). This creates a login placeholder.
2. Create their Firebase Auth login in Console → Authentication → Add user (same email).
3. On first sign-in the app auto-links the placeholder to their login and forces a password change.

### 5. Linking parents to children
Automatic when the parent's login email matches the student's **parentEmail** (filled at admission). Optionally an admin can also set the student's `parentId` to the parent's auth UID.

### 6. Demo data (optional)
Sign in as admin/principal and use **Load demo data** on the setup screen, or call `seedDemoData()` from `src/services/seed.ts`. Then create the 8 demo Auth users listed in `SEED_AUTH_ACCOUNTS` in the console.

## Login safety
- 3 wrong passwords → 15-minute lockout.
- 30 minutes idle → automatic logout.
- First login always forces a password change.

## Fee vouchers & bank accounts
Bank accounts are managed by the principal in **School Profile**. The default account is snapshotted onto every generated voucher (`bankSnapshot`) and printed on the 3-copy challan — no hardcoded bank anywhere.

## Scripts
- `npm run dev` — local dev server
- `npm run build` — type-check + production build
- `npm run lint` — type-check only
