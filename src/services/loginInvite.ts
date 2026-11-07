/**
 * Login invite for teachers, staff and parents — the professional way.
 *
 * When a teacher/staff member is added, or a student is admitted with a
 * parentEmail, this helper creates their login in one go:
 *
 *  1. Creates the Firebase Auth user (email + a random secret) on the
 *     secondary Auth instance, so the signed-in admin stays signed in.
 *  2. Tries the professional path first: a set-password email
 *     (Firebase sendPasswordResetEmail). The user clicks the link in their
 *     inbox and chooses their own password — the admin never sees one, and
 *     no forced password change is needed (isFirstLogin: false).
 *  3. If the email cannot be sent, falls back to the one-time temporary
 *     password: the same random secret is shown once to the admin (Copy /
 *     WhatsApp), and the first login forces a password change
 *     (isFirstLogin: true).
 *  4. Creates the Firestore `users` profile doc, keyed exactly like
 *     UserManager does (`pending_<email>`). On first login AuthContext
 *     adopts it to the real Auth uid (see loadProfile).
 *
 * Safety rules:
 *  - Idempotent: if a profile already exists for the email (sibling admitted,
 *    re-save, already-adopted account) nothing is created — returns 'exists'.
 *  - The secret is NEVER stored anywhere (not Firestore, not a log). It is
 *    returned only on the fallback path, so the UI can show it once.
 *  - Any failure here must never fail the staff/student save itself —
 *    callers save first, then call this and show the result separately.
 */
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, limit, query, setDoc, where,
} from 'firebase/firestore';
import { db, secondaryAuth } from '../config/firebase';
import { pendingUserDocId } from '../types';

export type LoginInviteResult =
  | { status: 'invited'; email: string; name: string; phone: string }
  | { status: 'created'; email: string; name: string; phone: string; tempPassword: string }
  | { status: 'exists'; email: string }
  | { status: 'failed'; email: string; error: string };

/** 10-char unambiguous alphabet — easy to read out over the phone. */
function generateSecret(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function friendlyError(e: any): string {
  const code = String(e?.code || '');
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  if (code.includes('operation-not-allowed')) return 'Email/password sign-in is not enabled in Firebase Console → Authentication → Sign-in method.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a moment and save again.';
  if (code.includes('network-request-failed')) return 'Network error. Check your connection and save again.';
  return e?.message || 'Could not create the login.';
}

export async function ensureLoginAccount(opts: {
  email: string;
  name: string;
  role: 'parent' | 'teacher' | 'staff';
  phone: string;
  schoolId: string;
  staffId?: string;
  photoURL?: string;
}): Promise<LoginInviteResult> {
  const email = opts.email.trim().toLowerCase();
  const name = opts.name.trim();
  const phone = opts.phone.trim();
  if (!email) return { status: 'failed', email, error: 'No email given.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 'failed', email, error: 'That email address looks invalid.' };
  }

  const docId = pendingUserDocId(email);
  try {
    // Idempotent: a profile for this email already exists (sibling, re-save,
    // already-adopted account)? Then there is nothing to create.
    const pending = await getDoc(doc(db, 'users', docId));
    if (pending.exists()) return { status: 'exists', email };
    const byEmail = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
    if (!byEmail.empty) return { status: 'exists', email };

    // One random secret serves both paths: it is the Auth password, and —
    // only if the invite email cannot be sent — the one-time temp password.
    const secret = generateSecret();
    let authExists = false;
    try {
      await createUserWithEmailAndPassword(secondaryAuth, email, secret);
    } catch (e: any) {
      if (String(e?.code || '').includes('email-already-in-use')) {
        authExists = true;
      } else {
        throw e;
      }
    } finally {
      // Always drop the secondary session — it must never linger.
      await signOut(secondaryAuth).catch(() => {});
    }

    // Professional path first: set-password email.
    let inviteSent = false;
    try {
      await sendPasswordResetEmail(secondaryAuth, email);
      inviteSent = true;
    } catch {
      inviteSent = false;
    }

    // Invite path: the user sets their own password via the link, so no
    // forced change. Fallback path: temp password, forced change on first login.
    await setDoc(doc(db, 'users', docId), {
      uid: docId,
      name,
      email,
      role: opts.role,
      phone,
      schoolId: opts.schoolId || 'main',
      ...(opts.staffId ? { staffId: opts.staffId } : {}),
      ...(opts.photoURL ? { photoURL: opts.photoURL } : {}),
      isActive: true,
      isFirstLogin: !inviteSent,
      createdAt: new Date().toISOString(),
    });

    if (inviteSent) return { status: 'invited', email, name, phone };
    if (authExists) {
      // Auth login existed but no profile, and the invite could not be sent —
      // nobody knows a working password, so point at the self-serve reset.
      return {
        status: 'failed',
        email,
        error: 'This email already has a login and the invite email could not be sent. Use "Forgot password" on the login page, or reset it in the Firebase Console.',
      };
    }
    return { status: 'created', email, name, phone, tempPassword: secret };
  } catch (e: any) {
    return { status: 'failed', email, error: friendlyError(e) };
  }
}
