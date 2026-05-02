import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let db = null;
let isConfigured = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isConfigured = true;
    console.log("Firebase initialized successfully.");
  } else {
    console.warn("Firebase config missing. Running in local-only mode.");
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

// We'll use a hardcoded user ID for a single-user system, 
// but this can be tied to Firebase Auth later.
const USER_DOC_ID = 'user_data_primary';

// 1. Sync data TO Firebase
export async function syncToFirebase(key, value) {
  if (!isConfigured || !db) return;
  try {
    const docRef = doc(db, 'users', USER_DOC_ID);
    await setDoc(docRef, { [key]: value }, { merge: true });
  } catch (e) {
    console.error("Error syncing to Firebase:", e);
  }
}

// 2. Fetch data FROM Firebase (on startup)
export async function fetchFromFirebase() {
  if (!isConfigured || !db) return null;
  try {
    const docRef = doc(db, 'users', USER_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) {
    console.error("Error fetching from Firebase:", e);
  }
  return null;
}

// 3. Listen for remote changes (multi-device sync)
export function listenForRemoteChanges(onDataChanged) {
  if (!isConfigured || !db) return null;
  const docRef = doc(db, 'users', USER_DOC_ID);
  return onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      onDataChanged(doc.data());
    }
  });
}

export function isFirebaseConfigured() {
  return isConfigured;
}
