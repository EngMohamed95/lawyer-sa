/**
 * بدء جلسة التطبيق بعد التحقق من Firebase Auth — مشتركة بين تسجيل الدخول والتسجيل الذاتي.
 *
 * تقرأ مستند المستخدم ومستند مكتبه، تطبّق قيود الحساب (معطَّل / تجربة منتهية)،
 * تملأ مفاتيح localStorage التي يقرؤها باقي التطبيق، وترجع الصفحة التي يُوجَّه إليها.
 */

import type { SessionUser } from "./authApi";
import { doc, getDoc, updateDoc } from "@/lib/store";
import { db } from "./firebase";

/** ينهي جلسة السيرفر (حساب مرفوض بعد التحقق من كلمة المرور) */
const endServerSession = () => import("./authApi").then(({ logout }) => logout());
import { getThemePref, setThemePref } from "./theme";

const STEP_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), STEP_TIMEOUT_MS);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (reason) => { window.clearTimeout(timer); reject(reason); },
    );
  });
}

/** المستخدم موجود في Firebase Auth بلا مستند في users — تسجيل ذاتي لم يكتمل تأكيده */
export class NoProfileError extends Error {
  constructor() {
    super("لم يتم العثور على حساب لهذا المستخدم في قاعدة البيانات.");
    this.name = "NoProfileError";
  }
}

/* ───────────────────────── الفترة التجريبية ───────────────────────── */

/** اشتراك المكتب كما يحتاجه قفل التجربة — يُحفظ لكل أدوار المكتب لا للمالك وحده */
export interface OfficeSubscription {
  billing: string;
  expiry: string;
  /** سجّل ذاتياً — الحذف التلقائي بعد التجربة يخص هذه المكاتب وحدها */
  selfSignup?: boolean;
}

export function readOfficeSubscription(): OfficeSubscription {
  return {
    billing: localStorage.getItem("officeBilling") || "",
    expiry: localStorage.getItem("officeExpiry") || "",
    selfSignup: localStorage.getItem("officeSelfSignup") === "1",
  };
}

/** التجربة المجانية انتهت ولم يُفعَّل اشتراك مدفوع — الدخول مقفل حتى الاشتراك */
export function isTrialLocked(sub: OfficeSubscription = readOfficeSubscription()): boolean {
  if (localStorage.getItem("userRole") === "SUPER_ADMIN") return false;
  if (sub.billing !== "trial" || !sub.expiry) return false;
  const t = new Date(sub.expiry).getTime();
  return !Number.isNaN(t) && t <= Date.now();
}

/** التجربة ما زالت سارية — تحصل خلالها المكاتب على كل مزايا الباقة الكاملة. */
export function isActiveTrial(sub: OfficeSubscription = readOfficeSubscription()): boolean {
  if (sub.billing !== "trial" || !sub.expiry) return false;
  const t = new Date(sub.expiry).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

export function trialDaysLeft(sub: OfficeSubscription = readOfficeSubscription()): number | null {
  if (sub.billing !== "trial" || !sub.expiry) return null;
  const t = new Date(sub.expiry).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}

/** أيام الاحتفاظ بالبيانات بعد انتهاء التجربة — يطابق TRIAL_GRACE_DAYS في public/trial-cleanup.php */
export const TRIAL_GRACE_DAYS = 10;

/** موعد حذف بيانات المكتب التجريبي إن لم يشترك */
export function trialDeletionDate(sub: OfficeSubscription = readOfficeSubscription()): Date | null {
  if (sub.billing !== "trial" || !sub.expiry || !sub.selfSignup) return null;
  const t = new Date(sub.expiry).getTime();
  return Number.isNaN(t) ? null : new Date(t + TRIAL_GRACE_DAYS * 86400000);
}

function storeOfficeSubscription(office: { subscriptionBilling?: string; subscriptionExpiry?: string; selfSignup?: boolean } | null | undefined) {
  localStorage.setItem("officeBilling", office?.subscriptionBilling || "");
  localStorage.setItem("officeExpiry", office?.subscriptionExpiry || "");
  localStorage.setItem("officeSelfSignup", office?.selfSignup ? "1" : "");
}

/**
 * يعيد قراءة اشتراك المكتب من قاعدة البيانات — بعد أن يفعّل مدير المنصة الاشتراك
 * يضغط المستخدم «تحقق من التفعيل» بدل تسجيل الخروج والدخول.
 */
export async function refreshOfficeSubscription(): Promise<boolean> {
  const lawyerId = localStorage.getItem("lawyerId");
  if (!lawyerId || lawyerId === "ALL") return false;
  const snap = await getDoc(doc(db, "users", lawyerId));
  const office = snap.data();
  storeOfficeSubscription(office);
  if (localStorage.getItem("userRole") === "LAWYER" && office) {
    if (office.subscriptionExpiry) localStorage.setItem("subscriptionExpiry", office.subscriptionExpiry);
    if (isActiveTrial()) localStorage.setItem("userPlan", "PREMIUM");
    else if (office.plan) localStorage.setItem("userPlan", office.plan);
  }
  return !isTrialLocked();
}

/* ───────────────────────── بدء الجلسة ───────────────────────── */

export interface StartSessionOptions {
  rememberMe: boolean;
  /** البريد المكتوب في النموذج — احتياطي إن لم يحمله Firebase */
  typedEmail?: string;
}

/** يرجع مسار التوجيه: /app أو /onboarding أو /subscription-expired */
export async function startSession(firebaseUser: SessionUser, opts: StartSessionOptions): Promise<string> {
  const userDoc = await withTimeout(
    getDoc(doc(db, "users", firebaseUser.uid)),
    "تم التحقق من بيانات الدخول، لكن تعذر تحميل بيانات الحساب. حاول مرة أخرى.",
  );
  if (!userDoc.exists()) throw new NoProfileError();

  const userData = userDoc.data();
  const role = userData?.role || "TRAINEE";
  let plan = userData?.plan || "BASIC";

  // SaaS Tenancy Logic:
  let lawyerId: string | null = null;
  let officeData: Record<string, any> | null | undefined = null;
  if (role === "LAWYER") {
    lawyerId = firebaseUser.uid;
    officeData = userData;
  } else if (role === "SUPER_ADMIN") {
    lawyerId = "ALL";
    plan = "PREMIUM";
  } else {
    const officeId: string | undefined = userData.lawyerId;
    // العميل (CLIENT) يبقى بلا lawyerId كما كان — وإلا عرضت لوحة التحكم بيانات المكتب كلها له
    lawyerId = role === "CLIENT" ? null : officeId || null;
    if (officeId) {
      // فشل قراءة المكتب يمنع الدخول — لا نتخطّى فحص التعطيل وقفل التجربة
      const lawyerDoc = await withTimeout(
        getDoc(doc(db, "users", officeId)),
        "تعذر تحميل بيانات المكتب. تحقق من الإنترنت ثم حاول مرة أخرى.",
      );
      officeData = lawyerDoc.exists() ? lawyerDoc.data() : null;
      // المتدرب ومحامي المكتب يرثان باقة المكتب — والأساسية إن انتهى اشتراكه المدفوع
      if ((role === "TRAINEE" || role === "OFFICE_LAWYER") && officeData) {
        const officeExpired = officeData.subscriptionExpiry
          && new Date(officeData.subscriptionExpiry) < new Date()
          && officeData.subscriptionBilling !== "trial";
        plan = officeExpired ? "BASIC" : officeData.plan || "BASIC";
      }
    }
  }

  // عضو فريق حذفه مدير المكتب، أو حساب معطَّل بعينه — لا يدخل
  if (role !== "SUPER_ADMIN" && role !== "LAWYER" && (userData?.deletedAt || userData?.status === "DISABLED" || userData?.status === "SUSPENDED")) {
    await endServerSession();
    throw new Error("هذا الحساب غير مفعّل. تواصل مع مدير المكتب.");
  }

  // مدير المنصة المعطَّل من «فريق مديري المنصة» لا يدخل
  if (role === "SUPER_ADMIN" && userData?.status === "DISABLED") {
    await endServerSession();
    throw new Error("هذا الحساب الإداري معطّل. تواصل مع المدير العام للمنصة.");
  }

  // المكتب الذي عطّله مدير المنصة (status: DISABLED) لا يدخل — لا مالكه ولا فريقه
  if (role !== "SUPER_ADMIN" && (officeData?.status === "DISABLED" || officeData?.status === "SUSPENDED")) {
    await endServerSession();
    throw new Error("هذا الحساب موقوف من إدارة المنصة. تواصل مع الدعم الفني لإعادة تفعيله.");
  }

  // انتهاء الاشتراك المدفوع: الرجوع للباقة الأساسية (التجربة المنتهية تُقفل بدل ذلك)
  if (role === "LAWYER" && userData?.subscriptionExpiry) {
    const expiry = new Date(userData.subscriptionExpiry);
    if (expiry < new Date() && userData.subscriptionBilling !== "trial") {
      plan = "BASIC";
    }
    localStorage.setItem("subscriptionExpiry", userData.subscriptionExpiry);
  }

  // طوال التجربة النشطة نفتح مزايا الباقة الكاملة، بصرف النظر عن المستوى
  // المخزّن في مستند الباقة التجريبية. حدود الاستخدام (ومنها AI) تبقى مستقلة.
  const trialOffice = role === "SUPER_ADMIN" ? null : officeData;
  if (trialOffice?.subscriptionBilling === "trial" && trialOffice.subscriptionExpiry) {
    const trialEnd = new Date(trialOffice.subscriptionExpiry).getTime();
    if (!Number.isNaN(trialEnd) && trialEnd > Date.now()) plan = "PREMIUM";
  }

  // آخر دخول — يظهر في «فريق مديري المنصة»؛ فشله لا يمنع الدخول
  void updateDoc(doc(db, "users", firebaseUser.uid), { lastLoginAt: new Date().toISOString() }).catch(() => {});

  const email = firebaseUser.email || opts.typedEmail || "";
  localStorage.setItem("isAuthenticated", "true");
  localStorage.setItem("userRole", role);
  localStorage.setItem("userPlan", plan);
  localStorage.setItem("userName", userData?.name || email.split("@")[0] || "مستخدم");
  localStorage.setItem("userEmail", email);
  localStorage.setItem("userId", firebaseUser.uid);
  localStorage.setItem("lawyerId", lawyerId || "");
  storeOfficeSubscription(role === "SUPER_ADMIN" ? null : officeData);

  // عملة المكتب تتبع دولته عند التسجيل الذاتي — ما لم يضبطها المستخدم من الإعدادات
  if (officeData?.country && !localStorage.getItem("sys_currency")) {
    const currency = officeData.country === "SA" ? "SAR" : officeData.country === "EG" ? "EGP" : "";
    if (currency) localStorage.setItem("sys_currency", currency);
  }

  if (opts.rememberMe) {
    localStorage.setItem("rememberLogin", "true");
    localStorage.setItem("rememberedEmail", email);
  } else {
    localStorage.removeItem("rememberLogin");
    localStorage.removeItem("rememberedEmail");
  }

  // سجل التدقيق عملية مساعدة؛ لا نسمح لاتصال Firestore البطيء أن يحبس المستخدم.
  void import("./audit")
    .then(({ writeAudit }) => writeAudit(
      { action: "LOGIN", entity: "session", entityId: firebaseUser.uid, entityLabel: userData?.name || email },
      { lawyerId, actorId: firebaseUser.uid, actorName: userData?.name || email, actorRole: role },
    ))
    .catch((auditError) => console.warn("تعذر تحميل سجل التدقيق:", auditError));

  if (isTrialLocked()) return "/subscription-expired";
  if (role === "LAWYER" && userData?.selfSignup && !userData?.onboardingCompleted) return "/onboarding";
  return "/app";
}

/** خروج كامل: جلسة MySQL + جلسة Firebase + التخزين المحلي — المظهر تفضيل للجهاز فيبقى */
export async function logout(): Promise<void> {
  const theme = getThemePref();
  const { logout: endServerSession } = await import("./authApi");
  await endServerSession();
  localStorage.clear();
  setThemePref(theme);
}
