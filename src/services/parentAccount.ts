/**
 * Parent login auto-creation on student admission.
 *
 * Previously a parent login needed two manual steps after admission: a profile
 * in the Users menu (principal portal) + a Firebase Auth user in the Console.
 * This helper does both from the admission form, in one go:
 *
 *  1. Creates the Firebase Auth user (email + generated temporary password) on
 *     the secondary Auth instance, so the signed-in admin stays signed in.
 *  2. Creates the Firestore `users` profile doc, keyed exactly like UserManager
 *     does (`pending_<email>`, isFirstLogin: true). On the parent's first
 *     login AuthContext adopts it to their Auth uid (see loadProfile).
 *
 * Safety rules:
 *  - Idempotent: if a profile already exists for the email (sibling admitted,
 *    re-save, already-adopted account) nothing is created — returns 'exists'.
 *  - The temporary password is NEVER stored anywhere (not Firestore, not a
 *    log). It is returned once so the UI can show it to the admin, who shares
 *    it with the parent. If it is lost, recovery is the existing Console /
 *    password-reset flow.
 *  - Any failure here must never fail the admission itself — callers save the
 *    student first, then call this and show the result separately.
 */
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, limit, query, setDoc, where,
} from 'firebase/firestore';
import { db, secondaryAuth } from '../config/firebase';
import { pendingUserDocId } from '../types';

export type ParentAccountResult =
  | { status: 'created'; email: string; tempPassword: string; phone: string; studentName: string }
  | { status: 'exists'; email: string }
  | { status: 'failed'; email: string; error: string };

/** 10-char unambiguous alphabet — easy to read out over the phone. */
function generateTempPassword(): string {
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
  return e?.message || 'Could not create the parent login.';
}

export async function ensureParentAccount(opts: {
  email: string;
  parentName: string;
  studentName: string;
  phone: string;
  schoolId: string;
}): Promise<ParentAccountResult> {
  const email = opts.email.trim().toLowerCase();
  if (!email) return { status: 'failed', email, error: 'No parent email given.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 'failed', email, error: 'That email address looks invalid.' };
  }

  const docId = pendingUserDocId(email);
  const profile = {
    uid: docId,
    name: opts.parentName.trim() || `Parent of ${opts.studentName.trim() || 'student'}`,
    email,
    role: 'parent' as const,
    phone: opts.phone.trim(),
    schoolId: opts.schoolId || 'main',
    isActive: true,
    isFirstLogin: true,
    createdAt: new Date().toISOString(),
  };

  try {
    // 1) Placeholder profile already there? (sibling, re-save, earlier admission)
    const pending = await getDoc(doc(db, 'users', docId));
    if (pending.exists()) return { status: 'exists', email };
    // 2) Already adopted to a uid-keyed doc (parent logged in before)?
    const byEmail = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)));
    if (!byEmail.empty) return { status: 'exists', email };

    // 3) Create the Auth login. If the email already has an Auth account (made
    //    in the Console earlier), just create the profile so first login adopts
    //    it — the parent keeps their existing password.
    const tempPassword = generateTempPassword();
    try {
      await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    } catch (e: any) {
      if (String(e?.code || '').includes('email-already-in-use')) {
        await setDoc(doc(db, 'users', docId), profile);
        return { status: 'exists', email };
      }
      throw e;
    } finally {
      // Always drop the secondary session — it must never linger.
      await signOut(secondaryAuth).catch(() => {});
    }

    await setDoc(doc(db, 'users', docId), profile);
    return {
      status: 'created',
      email,
      tempPassword,
      phone: opts.phone.trim(),
      studentName: opts.studentName.trim(),
    };
  } catch (e: any) {
    return { status: 'failed', email, error: friendlyError(e) };
  }
}
