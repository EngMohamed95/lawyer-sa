import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

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
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
