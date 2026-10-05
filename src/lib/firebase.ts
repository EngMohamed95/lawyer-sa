import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDsWX_Lp3FSQVx1zpYSrdlFvKX0AC8gc7U",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "lawyer-sa.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "lawyer-sa",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "lawyer-sa.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "755610160641",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:755610160641:web:8aeb37e010f0b16b437a00",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-NCMRZD30V0"
};

// Initialize Firebase
// Explicit development-only switch. A demo project can never touch production data.
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
const app = initializeApp(useEmulators ? {
  apiKey: "demo-key", projectId: "demo-lawyer-support", authDomain: "demo-lawyer-support.firebaseapp.com",
  storageBucket: "demo-lawyer-support.appspot.com", appId: "demo-support",
} : firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
if (useEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8088);
  connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });
  connectStorageEmulator(storage, "127.0.0.1", 9198);
}
export default app;
