/**
 * كان هنا تهيئة Firebase (Firestore + Auth + Storage). بعد التحويل لـ MySQL ما في Firebase
 * في الواجهة أبداً — الملف باقي بس عشان 69 ملف يستوردون منه `db` كأول معامل لـ collection().
 *
 *   db   : مقبض رمزي لطبقة البيانات (src/lib/store.ts)
 *   auth : المستخدم الحالي من الجلسة (الدخول نفسه في src/lib/authApi.ts بكوكي HttpOnly)
 */

import type { Firestore } from "./store";

export const db: Firestore = { type: "firestore" };

/** المستخدم الحالي (من بيانات الجلسة في المتصفح) — بديل auth.currentUser */
export const auth = {
  get currentUser(): { uid: string; email: string | null; displayName: string | null } | null {
    try {
      const uid = localStorage.getItem("userId");
      return uid ? { uid, email: localStorage.getItem("userEmail"), displayName: localStorage.getItem("userName") } : null;
    } catch {
      return null;
    }
  },
};

export default db;
