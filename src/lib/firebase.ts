import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAWYN_nG9tCYIG3_DfpumMvDnaS9YI_QlU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "lawyer-7c506.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "lawyer-7c506",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "lawyer-7c506.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "223439278921",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:223439278921:web:7510b793d99a4697364098",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-6EWPNR7Q2V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
