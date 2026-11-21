/**
 * حصة المكتب الشهرية من المساعد الذكي + حالة خدمة المنصة — نظير public/ai-proxy.php
 * في خادم Node، بنفس السلوك ونفس رموز الأخطاء.
 *
 * القراءة والكتابة عبر Firestore REST بتوكن المستخدم نفسه، فتسري قواعد الأمان
 * (راجع ai_usage و platform_status في firestore.rules) ولا حاجة لحساب خدمة.
 * الحصة 0 = غير محدود. مدير المنصة مستثنى. أي تعذّر في القراءة لا يوقف الخدمة.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "lawyer-sa";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const CTX_TTL_MS = 5 * 60_000;
const TRIAL_AI_QUOTA = 10;

export interface OfficeCtx {
  exempt: boolean;
  tenant: string;
  quota: number;
}

export class AiError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

type FsValue = Record<string, any>;

function fsValue(v: FsValue | undefined): any {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return Boolean(v.booleanValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) {
    const out: Record<string, any> = {};
    for (const [k, f] of Object.entries(v.mapValue?.fields ?? {})) out[k] = fsValue(f as FsValue);
    return out;
  }
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(fsValue);
  return null;
}

/** المستند كقاموس — null إن لم يوجد، undefined عند أي خطأ آخر */
async function fsGet(token: string, path: string): Promise<Record<string, any> | null | undefined> {
  try {
    const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const doc = (await res.json()) as { fields?: Record<string, FsValue> };
    const out: Record<string, any> = {};
    for (const [k, f] of Object.entries(doc.fields ?? {})) out[k] = fsValue(f);
    return out;
  } catch {
    return undefined;
  }
}

async function fsCommitWrite(token: string, path: string, fields: Record<string, FsValue>, transforms: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        writes: [{
          update: { name: `projects/${PROJECT_ID}/databases/(default)/documents/${path}`, fields },
          updateMask: { fieldPaths: Object.keys(fields) },
          updateTransforms: transforms,
        }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const month = () => new Date().toISOString().slice(0, 7);
const ctxCache = new Map<string, { ctx: OfficeCtx; expiresAt: number }>();

/** مكتب المستخدم وحصته — مخزّنة 5 دقائق لكل مستخدم. null إن تعذّر التحديد */
export async function officeContext(uid: string, token: string): Promise<OfficeCtx | null> {
  const cached = ctxCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.ctx;

  const user = await fsGet(token, `users/${encodeURIComponent(uid)}`);
  if (!user) return null;

  let ctx: OfficeCtx;
  if (user.role === "SUPER_ADMIN") {
    ctx = { exempt: true, tenant: "", quota: 0 };
  } else {
    const tenant = typeof user.lawyerId === "string" && user.lawyerId ? user.lawyerId : uid;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenant)) return null;
    const ownerDoc = tenant === uid ? user : await fsGet(token, `users/${encodeURIComponent(tenant)}`);
    if (ownerDoc === undefined) return null;
    const owner = ownerDoc ?? {};

    let quota = 0;
    const override = owner.quotaOverrides?.ai;
    if (typeof override === "number" && override >= 0) {
      quota = Math.floor(override);
    } else if (typeof owner.planId === "string" && owner.planId) {
      const plan = await fsGet(token, `subscriptionPlans/${encodeURIComponent(owner.planId)}`);
      if (plan === undefined) return null;
      const q = Number(plan?.quotas?.ai ?? 0);
      quota = Number.isFinite(q) && q > 0 ? Math.floor(q) : 0;
    }
    if (owner.subscriptionBilling === "trial") quota = TRIAL_AI_QUOTA;
    ctx = { exempt: false, tenant, quota };
  }
  ctxCache.set(uid, { ctx, expiresAt: Date.now() + CTX_TTL_MS });
  return ctx;
}

/** يرمي AiError إن استنفد المكتب حصته الشهرية */
export async function enforceQuota(ctx: OfficeCtx | null, token: string): Promise<void> {
  if (!ctx || ctx.exempt || ctx.quota <= 0) return;
  const usage = await fsGet(token, `ai_usage/${ctx.tenant}_${month()}`);
  if (!usage) return;
  const used = Number(usage.count ?? 0);
  if (used >= ctx.quota) {
    throw new AiError(
      429,
      `استنفد مكتبك حصته الشهرية من طلبات المساعد الذكي (${used} من ${ctx.quota}). ` +
        "تتجدد الحصة أول الشهر القادم، ولزيادتها تواصل مع مدير المكتب أو إدارة المنصة لترقية الباقة.",
      "OFFICE_QUOTA",
    );
  }
}

/** يحسب طلباً ناجحاً على المكتب */
export async function countUsage(ctx: OfficeCtx | null, token: string): Promise<void> {
  if (!ctx || ctx.exempt) return;
  const m = month();
  await fsCommitWrite(token, `ai_usage/${ctx.tenant}_${m}`,
    { lawyerId: { stringValue: ctx.tenant }, month: { stringValue: m } },
    [
      { fieldPath: "count", increment: { integerValue: "1" } },
      { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
    ]);
}

let platformDown = false;

/** يسجّل توقف مفتاح المنصة أو عودته في platform_status/ai — مرة واحدة لكل تحوّل */
export async function platformState(token: string, state: "DOWN" | "OK", reason = "", httpStatus = 0): Promise<void> {
  if ((state === "DOWN") === platformDown) return;
  const ok = await fsCommitWrite(token, "platform_status/ai", {
    state: { stringValue: state },
    reason: { stringValue: reason },
    httpStatus: { integerValue: String(httpStatus) },
  }, [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }]);
  if (ok) platformDown = state === "DOWN";
}

/** يحوّل فشل المزوّد لرسالة واضحة، ويبلغ الإدارة إن كان الخلل على مستوى المنصة */
export async function providerFailure(status: number, body: string, token: string): Promise<AiError | null> {
  let kind: "QUOTA" | "ACCOUNT" | "BUSY" | null = null;
  if (status === 429) kind = "QUOTA";
  else if (status === 401 || status === 403) kind = "ACCOUNT";
  else if (status === 400 && /API[_ ]?key/i.test(body)) kind = "ACCOUNT";
  else if ([500, 502, 503].includes(status)) kind = "BUSY";
  if (!kind) return null;

  if (kind === "BUSY") {
    return new AiError(503, "خدمة الذكاء الاصطناعي مشغولة مؤقتاً لدى المزوّد. أعد المحاولة بعد دقيقة.", "PROVIDER_BUSY");
  }
  await platformState(token, "DOWN", kind, status);
  return new AiError(
    503,
    kind === "QUOTA"
      ? "خدمة الذكاء الاصطناعي متوقفة مؤقتاً على مستوى المنصة (نفاد رصيد أو ضغط لدى المزوّد). تم إبلاغ إدارة المنصة، أعد المحاولة لاحقاً."
      : "خدمة الذكاء الاصطناعي متوقفة مؤقتاً بسبب مشكلة في إعداد المنصة. تم إبلاغ إدارة المنصة.",
    "PLATFORM_UNAVAILABLE",
  );
}
