import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, onSnapshot, getDoc,
  CollectionReference, DocumentReference,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { SchoolProfile } from '../types';

/** Realtime collection subscription. Returns data + loading + manual refresh (noop, realtime). */
export function useCollection<T>(path: string): { data: T[]; loading: boolean } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ref = collection(db, path) as CollectionReference;
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as T)));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [path]);
  return { data, loading };
}

/** Single document (realtime). */
export function useDoc<T>(path: string, id: string): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const ref = doc(db, path, id) as DocumentReference;
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [path, id]);
  return { data, loading };
}

/** School profile (doc id "main"). */
export function useSchool() {
  const { data, loading } = useDoc<SchoolProfile>('schools', 'main');
  return { school: data, loading };
}

/** One-time fetch of school profile (for print flows). */
export async function fetchSchool(): Promise<SchoolProfile | null> {
  const s = await getDoc(doc(db, 'schools', 'main'));
  return s.exists() ? ({ id: 'main', ...s.data() } as SchoolProfile) : null;
}

export function useRefreshKey() {
  const [key, setKey] = useState(0);
  const refresh = useCallback(() => setKey((k) => k + 1), []);
  return { key, refresh };
}
