/**
 * حارس جلسة الدخول.
 *
 * مصدر الحقيقة هو السيرفر (/api/v1/auth/me بكوكي الجلسة HttpOnly)، مو localStorage. لو
 * التخزين المحلي يقول «داخل» والسيرفر يقول لا، الجلسة انتهت ونعلم المستخدم صراحةً بدل ما
 * يشوف أصفار وأخطاء صلاحيات ما يفهمها.
 */

import { useEffect, useState } from "react";
import type { SessionUser } from "./authApi";

export type SessionState =
  /** ما زلنا ننتظر رد السيرفر — لا نقرّر شيئاً بعد */
  | "checking"
  /** السيرفر يؤكّد الجلسة — كل شيء سليم */
  | "authenticated"
  /** localStorage يقول داخل والسيرفر يقول خارج — الجلسة انتهت */
  | "expired"
  /** لا جلسة أصلاً */
  | "signed-out";

export interface AuthSession {
  state: SessionState;
  user: SessionUser | null;
  /** بريد المستخدم — للعرض في شاشة انتهاء الجلسة */
  email: string | null;
}

/** يمسح آثار الجلسة المحلية دون لمس تفضيلات المكتب */
export function clearLocalSession(): void {
  const keys = [
    "isAuthenticated", "userRole", "userId", "userName",
    "userEmail", "lawyerId", "userPlan",
    "subscriptionExpiry", "officeBilling", "officeExpiry", "officeSelfSignup",
  ];
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch { /* تجاهل */ }
  }
}

/** نتيجة التحقق مشتركة بين كل المكوّنات في نفس الصفحة — طلب /auth/me واحد بدل طلب لكل مكوّن */
let shared: Promise<SessionUser | null | "offline"> | null = null;

function checkSession(): Promise<SessionUser | null | "offline"> {
  shared ??= import("./authApi")
    .then(({ me, toSessionUser }) => me().then((u) => (u ? toSessionUser(u) : null)))
    .catch(() => "offline" as const)
    .finally(() => { window.setTimeout(() => { shared = null; }, 5_000); });
  return shared;
}

export function useAuthSession(): AuthSession {
  const [state, setState] = useState<SessionState>("checking");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const claimsLoggedIn = () => localStorage.getItem("isAuthenticated") === "true";

    void checkSession().then((result) => {
      if (cancelled) return;
      if (result === "offline") {
        // خطأ شبكة: ما نطلّع المستخدم (ممكن غير متصل مؤقتاً) — نعتمد على آخر بيانات محلية
        const uid = localStorage.getItem("userId");
        if (claimsLoggedIn() && uid) {
          setUser({ uid, email: localStorage.getItem("userEmail") });
          setEmail(localStorage.getItem("userEmail"));
          setState("authenticated");
        } else {
          setState("signed-out");
        }
        return;
      }
      if (result) {
        setUser(result);
        setEmail(result.email);
        setState("authenticated");
        return;
      }
      setUser(null);
      setEmail(localStorage.getItem("userEmail"));
      setState(claimsLoggedIn() ? "expired" : "signed-out");
    });

    return () => { cancelled = true; };
  }, []);

  return { state, user, email };
}
