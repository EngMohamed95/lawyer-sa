/**
 * حارس جلسة المصادقة.
 *
 * المشكلة التي يعالجها: التطبيق كان يقرّر «مسجَّل الدخول» من localStorage
 * وحده. حين تنتهي جلسة Firebase Auth أو يفشل تجديد التوكن، تبقى الواجهة
 * تعرض المستخدم داخلاً بينما كل قراءة من Firestore تُرفض بـ
 * permission-denied — فيرى المستخدم أصفاراً ورسالة خطأ بلا سبب واضح.
 *
 * هذا الخطّاف يجعل مصدر الحقيقة هو Firebase Auth نفسه، ويكشف انتهاء
 * الجلسة صراحةً بدل تركها تتسرّب كأخطاء صلاحيات.
 */

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

export type SessionState =
  /** ما زلنا ننتظر رد Firebase — لا نقرّر شيئاً بعد */
  | "checking"
  /** Firebase يؤكّد المستخدم — كل شيء سليم */
  | "authenticated"
  /** localStorage يقول داخل و Firebase يقول خارج — الجلسة انتهت */
  | "expired"
  /** لا جلسة أصلاً */
  | "signed-out";

export interface AuthSession {
  state: SessionState;
  user: User | null;
  /** بريد المستخدم كما يعرفه Firebase — للعرض في شاشة انتهاء الجلسة */
  email: string | null;
}

/** يمسح آثار الجلسة المحلية دون لمس تفضيلات المكتب */
export function clearLocalSession(): void {
  const keys = [
    "isAuthenticated", "userRole", "userId", "userName",
    "userEmail", "lawyerId", "userPlan",
  ];
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch { /* تجاهل */ }
  }
}

export function useAuthSession(): AuthSession {
  const [state, setState] = useState<SessionState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const claimsLoggedIn = () => localStorage.getItem("isAuthenticated") === "true";

    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        if (u) {
          setUser(u);
          setEmail(u.email ?? null);
          setState("authenticated");
          return;
        }
        setUser(null);
        // Firebase يقول لا مستخدم. إن كان التخزين المحلي يدّعي العكس
        // فالجلسة انتهت ويجب إعلام المستخدم صراحةً.
        setEmail(localStorage.getItem("userEmail"));
        setState(claimsLoggedIn() ? "expired" : "signed-out");
      },
      (err) => {
        console.error("تعذّر التحقق من جلسة المصادقة:", err);
        setUser(null);
        setState(claimsLoggedIn() ? "expired" : "signed-out");
      },
    );

    return unsub;
  }, []);

  return { state, user, email };
}
