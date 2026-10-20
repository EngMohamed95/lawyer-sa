/**
 * باقات الاشتراك وحالة اشتراك المكاتب — يديرها مدير المنصة.
 *
 * الباقات في المجموعة subscriptionPlans (المعرّف = رمز الباقة).
 * كل باقة تحمل «مستوى المزايا» tier (BASIC | PROFESSIONAL | PREMIUM) — وهو
 * ما يُكتب في users.plan فتبقى بوابات المزايا القائمة في النظام كما هي.
 * اشتراك المكتب في مستند مالكه بـ users: planId · plan · subscriptionStart ·
 * subscriptionExpiry · subscriptionBilling · quotaOverrides.
 */

import { collection, doc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

export type PlanTier = "BASIC" | "PROFESSIONAL" | "PREMIUM";
export type PlanBilling = "trial" | "monthly" | "annual";
export type Currency = "SAR" | "EGP" | "USD";
export type QuotaKey = "cases" | "clients" | "team";

export const TIER_LABELS: Record<PlanTier, string> = {
  BASIC: "أساسية — القضايا والعملاء والجلسات",
  PROFESSIONAL: "احترافية — + المهام والمستندات والحسابات",
  PREMIUM: "الشركات — كل المزايا مع المساعد الذكي والتقارير",
};
export const BILLING_LABELS: Record<PlanBilling, string> = { trial: "تجريبية", monthly: "شهري", annual: "سنوي" };
export const CURRENCIES: { code: Currency; label: string; flag: string }[] = [
  { code: "SAR", label: "ريال سعودي", flag: "SA" },
  { code: "EGP", label: "جنيه مصري", flag: "EG" },
  { code: "USD", label: "دولار أمريكي", flag: "USD" },
];
export const QUOTA_LABELS: Record<QuotaKey, string> = { cases: "القضايا", clients: "العملاء", team: "أعضاء الفريق" };
export const QUOTA_KEYS: QuotaKey[] = ["cases", "clients", "team"];

/** أيام السماح بعد انتهاء الاشتراك قبل اعتباره منتهياً */
export const GRACE_DAYS = 7;

export interface SubscriptionPlan {
  id: string;
  name: string;
  nameEn: string;
  tier: PlanTier;
  billing: PlanBilling;
  /** مدة الاشتراك بالأيام — للتجريبية عدد أيام التجربة */
  durationDays: number;
  /** 0 = غير محدود */
  quotas: Record<QuotaKey, number>;
  prices: Record<Currency, number>;
  active: boolean;
  order: number;
}

/** الباقات الافتراضية — بنفس أسعار ومستويات النظام الحالية */
export const DEFAULT_PLANS: SubscriptionPlan[] = [
  { id: "trial", name: "الباقة التجريبية", nameEn: "Free Trial", tier: "PROFESSIONAL", billing: "trial", durationDays: 14,
    quotas: { cases: 20, clients: 20, team: 2 }, prices: { SAR: 0, EGP: 0, USD: 0 }, active: true, order: 0 },
  { id: "basic", name: "الباقة الأساسية", nameEn: "Basic Plan", tier: "BASIC", billing: "monthly", durationDays: 30,
    quotas: { cases: 100, clients: 100, team: 2 }, prices: { SAR: 0, EGP: 200, USD: 0 }, active: true, order: 1 },
  { id: "professional", name: "الباقة الاحترافية", nameEn: "Professional Plan", tier: "PROFESSIONAL", billing: "monthly", durationDays: 30,
    quotas: { cases: 500, clients: 500, team: 5 }, prices: { SAR: 0, EGP: 500, USD: 0 }, active: true, order: 2 },
  { id: "enterprise", name: "باقة الشركات", nameEn: "Enterprise Plan", tier: "PREMIUM", billing: "annual", durationDays: 365,
    quotas: { cases: 0, clients: 0, team: 20 }, prices: { SAR: 0, EGP: 10000, USD: 0 }, active: true, order: 3 },
];

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function sanitizePlan(id: string, d: any): SubscriptionPlan {
  const tier: PlanTier = ["BASIC", "PROFESSIONAL", "PREMIUM"].includes(d?.tier) ? d.tier : "BASIC";
  const billing: PlanBilling = ["trial", "monthly", "annual"].includes(d?.billing) ? d.billing : "monthly";
  return {
    id,
    name: String(d?.name || id),
    nameEn: String(d?.nameEn || ""),
    tier,
    billing,
    durationDays: num(d?.durationDays, billing === "annual" ? 365 : billing === "trial" ? 14 : 30),
    quotas: { cases: num(d?.quotas?.cases), clients: num(d?.quotas?.clients), team: num(d?.quotas?.team) },
    prices: { SAR: num(d?.prices?.SAR), EGP: num(d?.prices?.EGP), USD: num(d?.prices?.USD) },
    active: d?.active !== false,
    order: num(d?.order),
  };
}

export async function loadPlans(): Promise<SubscriptionPlan[]> {
  const snap = await getDocs(collection(db, "subscriptionPlans"));
  return snap.docs.map((d) => sanitizePlan(d.id, d.data())).sort((a, b) => a.order - b.order);
}

export async function savePlan(plan: SubscriptionPlan): Promise<void> {
  const { id, ...data } = sanitizePlan(plan.id, plan);
  await setDoc(doc(db, "subscriptionPlans", id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function setPlanActive(id: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, "subscriptionPlans", id), { active, updatedAt: new Date().toISOString() });
}

export async function seedDefaultPlans(): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  DEFAULT_PLANS.forEach(({ id, ...data }) => batch.set(doc(db, "subscriptionPlans", id), { ...data, createdAt: now, updatedAt: now }));
  await batch.commit();
}

/** رمز آمن لمعرّف الباقة: حروف لاتينية صغيرة وأرقام وشرطة */
export const toPlanCode = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

/* ───────────────────────── حالة اشتراك المكتب ───────────────────────── */

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "GRACE" | "EXPIRED" | "NONE";

export const STATUS_META: Record<SubscriptionStatus, { label: string; className: string }> = {
  ACTIVE: { label: "نشط", className: "bg-emerald-100 text-emerald-700" },
  TRIAL: { label: "فترة تجريبية", className: "bg-cyan-100 text-cyan-700" },
  GRACE: { label: "فترة سماح", className: "bg-amber-100 text-amber-700" },
  EXPIRED: { label: "منتهي الصلاحية", className: "bg-red-100 text-red-600" },
  NONE: { label: "بدون اشتراك", className: "bg-slate-100 text-slate-600" },
};

export const daysUntil = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
};

export function subscriptionStatus(office: { subscriptionExpiry?: string; planId?: string }, plan?: SubscriptionPlan | null): SubscriptionStatus {
  const days = daysUntil(office.subscriptionExpiry);
  if (days === null) return "NONE";
  if (days > 0) return plan?.billing === "trial" ? "TRIAL" : "ACTIVE";
  return days > -GRACE_DAYS ? "GRACE" : "EXPIRED";
}

/** الحصة الفعلية للمكتب: الحصة المخصصة إن وُجدت وإلا حصة الباقة (0 = غير محدود) */
export function effectiveQuota(office: { quotaOverrides?: Partial<Record<QuotaKey, number>> }, plan: SubscriptionPlan | null | undefined, key: QuotaKey): number {
  const override = office.quotaOverrides?.[key];
  if (typeof override === "number" && override >= 0) return override;
  return plan?.quotas[key] ?? 0;
}

/** يربط مكتباً بباقة لمدة جديدة تبدأ اليوم (أو تمدّ فوق الاشتراك القائم إن طُلب) */
export async function assignPlan(officeId: string, plan: SubscriptionPlan, opts: { extendFrom?: string | null } = {}): Promise<{ start: string; expiry: string }> {
  const base = opts.extendFrom ? new Date(Math.max(Date.now(), new Date(opts.extendFrom).getTime())) : new Date();
  const start = opts.extendFrom ? undefined : base.toISOString();
  const expiry = new Date(base.getTime() + plan.durationDays * 86400000).toISOString();
  await updateDoc(doc(db, "users", officeId), {
    planId: plan.id,
    plan: plan.tier,
    subscriptionBilling: plan.billing === "annual" ? "annual" : "monthly",
    subscriptionExpiry: expiry,
    ...(start ? { subscriptionStart: start } : {}),
  });
  return { start: start || "", expiry };
}
