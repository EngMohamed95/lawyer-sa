/**
 * مصادقة مسارات الخادم — الميزة 001، الثغرة V3.
 *
 * ما كان قائماً: كل مسار في /api/* مفتوح بلا أي تحقق. أخطرها
 * `PUT /api/users/:uid/password` — أي شخص يعرف uid يغيّر كلمة سر أي مستخدم.
 *
 * التحقق هنا من توكن Firebase الحقيقي، بطريقين:
 *   1. Admin SDK متى توفّرت بيانات حساب الخدمة (الأدق — يفحص الإبطال أيضاً).
 *   2. تحقق يدوي من توقيع JWT بمفاتيح Google العامة — يعمل بلا حساب خدمة،
 *      فلا يبقى المسار مكشوفاً لمجرد أن المفتاح غير مضبوط على الاستضافة.
 *
 * ⚠️ الطريق الثاني لا يكشف التوكنات المُبطَلة (revoked) قبل انتهاء صلاحيتها.
 *    ضبط FIREBASE_SERVICE_ACCOUNT_KEY يرفع مستوى التحقق تلقائياً.
 */

import type { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import crypto from "crypto";

const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  "lawyer-sa";

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export interface AuthedUser {
  uid: string;
  email?: string;
  /** من Custom Claims إن وُجدت، وإلا من مستند users */
  role?: string;
  lawyerId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/* ────────────────────────── مفاتيح Google العامة ────────────────────────── */

let certCache: { keys: Record<string, string>; expiresAt: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAt) return certCache.keys;

  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error(`تعذّر جلب مفاتيح Google (${res.status})`);
  const keys = (await res.json()) as Record<string, string>;

  // نحترم Cache-Control بدل تثبيت مدة عشوائية
  const cc = res.headers.get("cache-control") ?? "";
  const maxAge = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 3600);
  certCache = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

const b64urlToBuffer = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** تحقق يدوي من توكن Firebase — يُستخدم حين لا يتوفر Admin SDK */
async function verifyManually(token: string): Promise<AuthedUser> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("توكن غير صالح");

  const [rawHeader, rawPayload, rawSig] = parts;
  const header = JSON.parse(b64urlToBuffer(rawHeader).toString("utf8"));
  const payload = JSON.parse(b64urlToBuffer(rawPayload).toString("utf8"));

  if (header.alg !== "RS256") throw new Error("خوارزمية توقيع غير مقبولة");
  if (!header.kid) throw new Error("التوكن بلا معرّف مفتاح");

  const certs = await googleCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("مفتاح التوقيع غير معروف");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${rawHeader}.${rawPayload}`);
  if (!verifier.verify(cert, b64urlToBuffer(rawSig))) {
    throw new Error("توقيع التوكن غير صحيح");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new Error("انتهت صلاحية التوكن");
  if (typeof payload.iat !== "number" || payload.iat > now + 60) throw new Error("زمن الإصدار غير منطقي");
  if (payload.aud !== PROJECT_ID) throw new Error("التوكن ليس لهذا المشروع");
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error("مُصدِر غير موثوق");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("التوكن بلا هوية");

  return {
    uid: payload.sub,
    email: payload.email,
    role: payload.role,
    lawyerId: payload.lawyerId,
  };
}

/** يتحقق من التوكن بأفضل وسيلة متاحة */
export async function verifyToken(token: string): Promise<AuthedUser> {
  if (admin.apps.length) {
    const decoded = await admin.auth().verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role as string | undefined,
      lawyerId: decoded.lawyerId as string | undefined,
    };
  }
  return verifyManually(token);
}

/* ────────────────────────── الوسائط ────────────────────────── */

function bearer(req: Request): string | null {
  const h = req.headers.authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** يرفض بلا توكن صالح — 401 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) {
    return res.status(401).json({ error: "مطلوب تسجيل الدخول." });
  }
  try {
    req.user = await verifyToken(token);
    return next();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "توكن غير صالح";
    return res.status(401).json({ error: `جلسة غير صالحة: ${detail}` });
  }
}

/**
 * يُكمل هوية المستخدم من مستند users حين تغيب Custom Claims.
 * الـ claims هي المصدر الأمثل، لكنها لم تُفعَّل بعد على هذا المشروع.
 */
async function enrichFromFirestore(user: AuthedUser): Promise<AuthedUser> {
  if (user.role && user.lawyerId) return user;
  if (!admin.apps.length) return user;
  try {
    const snap = await admin.firestore().collection("users").doc(user.uid).get();
    if (!snap.exists) return user;
    const d = snap.data() ?? {};
    return {
      ...user,
      role: user.role ?? (d.role as string | undefined),
      // مالك المكتب لا يحمل lawyerId — الاتفاق أنه uid
      lawyerId: user.lawyerId ?? (d.lawyerId as string | undefined) ?? user.uid,
    };
  } catch {
    return user;
  }
}

/** يشترط دوراً من قائمة — 403 عند عدم الكفاية */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "مطلوب تسجيل الدخول." });
    req.user = await enrichFromFirestore(req.user);
    if (!req.user.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "لا تملك صلاحية تنفيذ هذا الإجراء." });
    }
    return next();
  };
}

/**
 * تغيير بيانات دخول مستخدم آخر (المعيار AC-4):
 * مسموح للسوبر أدمن، أو لمدير المكتب على مستخدمي مكتبه، أو للمستخدم على نفسه.
 */
export async function requireUserAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "مطلوب تسجيل الدخول." });
  req.user = await enrichFromFirestore(req.user);

  const targetUid = req.params.uid;
  const me = req.user;

  if (me.uid === targetUid) return next();
  if (me.role === "SUPER_ADMIN") return next();

  if (me.role === "LAWYER") {
    // مدير المكتب: فقط على من ينتمي لمكتبه
    if (!admin.apps.length) {
      return res.status(503).json({
        error: "التحقق من ملكية المكتب غير متاح — بيانات حساب الخدمة غير مضبوطة على الخادم.",
      });
    }
    try {
      const snap = await admin.firestore().collection("users").doc(targetUid).get();
      const targetTenant = snap.exists
        ? ((snap.data()?.lawyerId as string | undefined) ?? targetUid)
        : null;
      if (targetTenant && targetTenant === (me.lawyerId ?? me.uid)) return next();
    } catch {
      return res.status(500).json({ error: "تعذّر التحقق من صلاحية الوصول." });
    }
  }

  return res.status(403).json({ error: "لا تملك صلاحية تعديل بيانات هذا المستخدم." });
}
