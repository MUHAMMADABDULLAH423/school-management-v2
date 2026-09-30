import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { UserProfile, UserRole, pendingUserDocId } from '../types';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  currentUser: UserProfile | null;
  isLoading: boolean;
  firebaseReady: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string; firstLogin?: boolean }>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<boolean>;
  /** Sends a Firebase password-reset email. Returns ok:false with a message on failure. */
  resetPassword: (email: string) => Promise<{ ok: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_MS = 30 * 60 * 1000;

async function audit(userId: string, userName: string, action: string, category: string, details: string) {
  try {
    await addDoc(collection(db, 'auditLog'), {
      userId, userName, action, category, details, timestamp: new Date().toISOString(),
    });
  } catch { /* audit must never break the app */ }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (fu: FirebaseUser): Promise<UserProfile | null> => {
    const snap = await getDoc(doc(db, 'users', fu.uid));
    let d: any = snap.exists() ? snap.data() : null;
    let uid = fu.uid;
    // Fallback: profile created by principal/admin BEFORE the Firebase Auth login
    // existed. Placeholder docs are keyed by email (pendingUserDocId), so this is
    // a direct GET — no users-list permission needed.
    if (!d && fu.email) {
      const tried = new Set<string>();
      for (const key of [pendingUserDocId(fu.email), fu.email.trim().toLowerCase(), fu.email]) {
        if (tried.has(key)) continue;
        tried.add(key);
        const psnap = await getDoc(doc(db, 'users', key));
        if (psnap.exists() && (psnap.data().email || '').toLowerCase() === fu.email.toLowerCase()) {
          const pd = psnap.data();
          d = pd;
          // adopt: move to uid-keyed doc so future logins are direct.
          // (rules allow self-claim: doc id == auth uid, email matches token, non-privileged role)
          await setDoc(doc(db, 'users', fu.uid), { ...pd, uid: fu.uid }, { merge: true });
          // remove the placeholder so UserManager doesn't list duplicates.
          // Parent/child links keep working via parentEmail fallback (see parentOfStudent rule).
          try {
            await deleteDoc(psnap.ref);
          } catch { /* non-fatal: an admin can remove the leftover placeholder */ }
          break;
        }
      }
    }
    if (!d) return null;
    if (d.isActive === false) return null;
    return {
      uid,
      name: d.name || fu.email || 'User',
      email: d.email || fu.email || '',
      role: d.role as UserRole,
      photoURL: d.photoURL,
      phone: d.phone,
      schoolId: d.schoolId || 'main',
      staffId: d.staffId,
      isActive: d.isActive !== false,
      isFirstLogin: d.isFirstLogin === true,
      createdAt: d.createdAt || '',
    };
  }, []);

  // Firebase auth state listener
  useEffect(() => {
    if (!isFirebaseConfigured) { setIsLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (fu) => {
      setFirebaseUser(fu);
      if (fu) {
        try {
          const profile = await loadProfile(fu);
          setCurrentUser(profile);
          if (!profile) await signOut(auth); // no valid profile → force out
        } catch {
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setIsLoading(false);
    });
    return unsub;
  }, [loadProfile]);

  const logout = useCallback(async () => {
    if (currentUser) {
      await audit(currentUser.uid, currentUser.name, 'Logout', 'AUTH', `${currentUser.role} signed out`);
    }
    await signOut(auth);
    setCurrentUser(null);
    setFirebaseUser(null);
  }, [currentUser]);

  // Inactivity auto-logout
  useEffect(() => {
    if (!currentUser) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logout(), INACTIVITY_MS);
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [currentUser, logout]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await loadProfile(cred.user);
      if (!profile) {
        await signOut(auth);
        return { ok: false, error: 'No active school account found for this login.' };
      }
      setCurrentUser(profile);
      await audit(profile.uid, profile.name, 'Login', 'AUTH', `${profile.role} signed in`);
      return { ok: true, firstLogin: profile.isFirstLogin };
    } catch (err: any) {
      const code = err?.code || '';
      const msg =
        code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')
          ? 'Incorrect email or password.'
          : code.includes('too-many-requests')
            ? 'Too many attempts. Please wait and try again.'
            : 'Login failed. Check your connection and try again.';
      return { ok: false, error: msg };
    }
  }, [loadProfile]);

  const changePassword = useCallback(async (newPassword: string) => {
    if (!firebaseUser || !currentUser) return false;
    try {
      await updatePassword(firebaseUser, newPassword);
      await setDoc(doc(db, 'users', firebaseUser.uid), { isFirstLogin: false }, { merge: true });
      setCurrentUser({ ...currentUser, isFirstLogin: false });
      await audit(currentUser.uid, currentUser.name, 'Password changed', 'AUTH', 'Password updated');
      return true;
    } catch {
      return false;
    }
  }, [firebaseUser, currentUser]);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUser) return;
    const p = await loadProfile(firebaseUser);
    setCurrentUser(p);
  }, [firebaseUser, loadProfile]);

  const resetPassword = useCallback(async (email: string) => {
    const addr = email.trim();
    if (!addr) return { ok: false, error: 'Please enter your email address first.' };
    try {
      await sendPasswordResetEmail(auth, addr);
      return { ok: true };
    } catch (err: any) {
      const code = err?.code || '';
      // Don't reveal whether the email exists — same message either way.
      if (code.includes('user-not-found')) return { ok: true };
      if (code.includes('invalid-email')) return { ok: false, error: 'That email address looks invalid.' };
      if (code.includes('too-many-requests')) return { ok: false, error: 'Too many requests. Please wait a while and try again.' };
      return { ok: false, error: 'Could not send the reset email. Check your connection and try again.' };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser, currentUser, isLoading,
        firebaseReady: isFirebaseConfigured,
        login, logout, changePassword, resetPassword, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export { serverTimestamp };
