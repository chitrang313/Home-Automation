/**
 * Firebase client SDK setup.
 *
 *  - auth       Email/password authentication
 *  - rtdb       Realtime Database — used ONLY for live relay state at
 *               /devices/{deviceId}/relays/{relayN}
 *  - firestore  Cloud Firestore — used for everything else (persons, houses,
 *               rooms, boards, appliances)
 *
 * `db` is kept as an alias for `rtdb` so existing files importing { db }
 * keep working without changes.
 */
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth      = getAuth(app);
export const rtdb      = getDatabase(app);
export const firestore = getFirestore(app);

// Backward-compat alias — existing imports use `db` to mean the RTDB instance.
export const db = rtdb;
