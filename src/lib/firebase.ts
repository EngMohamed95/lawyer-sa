import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyAWYN_nG9tCYIG3_DfpumMvDnaS9YI_QlU",
  authDomain: "lawyer-7c506.firebaseapp.com",
  projectId: "lawyer-7c506",
  storageBucket: "lawyer-7c506.firebasestorage.app",
  messagingSenderId: "223439278921",
  appId: "1:223439278921:web:7510b793d99a4697364098",
  measurementId: "G-6EWPNR7Q2V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
