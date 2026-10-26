/**
 * تصنيفات طلب التنفيذ كما في ناجز — تُحفظ على القضية في
 * enforcementRequestType (تصنيف الطلب) و enforcementRequestKind (نوع الطلب داخل التصنيف)
 * و enforcementDeedType (قديم — لم يعد في النموذج).
 * و«مضمون الطلب» (بيانات المبلغ والسند) في executionDetails.
 */

// «أخرى» تبقى آخر خيار دائماً
export const EXECUTION_REQUEST_TYPES = [
  "أوراق تجارية",
  "أحكام وقرارات",
  "عقود",
  "أخرى",
];

/** اقتراحات «نوع الطلب» لكل تصنيف — الحقل نص حر، والاقتراحات للمساعدة فقط */
export const EXECUTION_REQUEST_KINDS: Record<string, string[]> = {
  "أوراق تجارية": ["شيك", "سند لأمر", "كمبيالة"],
  "أحكام وقرارات": ["حكم قضائي", "قرار قضائي", "أمر قضائي", "حكم محكمين", "حكم أجنبي"],
  "عقود": ["عقد موثق", "عقد إيجار موثق", "محضر صلح"],
  "أخرى": [],
};

/** «التصنيف — النوع» للعرض في القوائم والتقارير */
export const executionRequestLabel = (c: any): string =>
  [c?.enforcementRequestType, c?.enforcementRequestKind].filter(Boolean).join(" — ");

export const EXECUTION_DEED_TYPES = [
  "حكم /قرار/ أمر صادر من المحكمة",
  "شيك",
  "سند لأمر",
  "كمبيالة",
  "محضر صلح",
  "عقد موثق",
  "حكم محكمين",
  "أخرى",
];

export const MATURITY_STATUSES = ["مستحق", "غير مستحق", "مستحق جزئياً"];

/** دفعة مستلمة من المنفذ ضده */
export interface ExecutionPayment {
  amount: string;
  /** YYYY-MM-DD */
  date: string;
  note: string;
}

/** مضمون طلب التنفيذ — بيانات المبلغ والسند كما في ناجز */
export interface ExecutionDetails {
  /** منطوق الحكم */
  judgmentText: string;
  /** مضمون الطلب */
  requestContent: string;
  /** المبلغ المدون في السند / المحكوم به */
  deedAmount: string;
  /** المبلغ المستلم — عند وجود دفعات يساوي مجموعها دائماً */
  receivedAmount: string;
  /** الدفعات المستلمة — اختيارية؛ بدونها يُكتب المستلم مباشرة */
  payments: ExecutionPayment[];
  /** المبلغ المطلوب تنفيذه */
  requestedAmount: string;
  /** تاريخ تحرير السند YYYY-MM-DD */
  deedDate: string;
  /** مكان تحرير / صدور السند (الدولة) */
  deedPlace: string;
  deedCity: string;
  /** مكان الوفاء */
  paymentPlace: string;
  maturityStatus: string;
}

export const EMPTY_EXECUTION_DETAILS: ExecutionDetails = {
  judgmentText: "", requestContent: "",
  deedAmount: "", receivedAmount: "", payments: [], requestedAmount: "",
  deedDate: "", deedPlace: "السعودية", deedCity: "", paymentPlace: "", maturityStatus: "مستحق",
};

export function executionDetailsOf(c: any): ExecutionDetails {
  const src = c?.executionDetails && typeof c.executionDetails === "object" ? c.executionDetails : {};
  const out: ExecutionDetails = { ...EMPTY_EXECUTION_DETAILS, payments: [] };
  for (const k of Object.keys(out) as (keyof ExecutionDetails)[]) {
    if (k === "payments") continue;
    if (typeof src[k] === "string") out[k] = src[k];
  }
  if (Array.isArray(src.payments)) {
    out.payments = src.payments
      .filter((p: any) => p && typeof p === "object")
      .map((p: any) => ({ amount: String(p.amount ?? ""), date: String(p.date ?? ""), note: String(p.note ?? "") }));
  }
  // الطلبات السابقة كتبت «منطوق الحكم / مضمون السند» في caseSubject
  if (!out.judgmentText && typeof c?.caseSubject === "string") out.judgmentText = c.caseSubject;
  return out;
}

const toNumber = (v: string) => {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** مجموع الدفعات كنص رقمي — يُكتب في receivedAmount فيبقى كل ما يقرأ المستلم صحيحاً */
export const paymentsTotal = (payments: ExecutionPayment[]): string =>
  String(Math.round(payments.reduce((s, p) => s + toNumber(p.amount), 0) * 100) / 100);

/** المبلغ المتبقي = المدون في السند − المستلم */
export const remainingAmount = (d: ExecutionDetails) =>
  d.deedAmount ? Math.max(0, toNumber(d.deedAmount) - toNumber(d.receivedAmount)) : null;

export const formatMoney = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : toNumber(v);
  return `${n.toLocaleString("en-US")} ريال`;
};

/* ── حالة ملف التنفيذ — مشتركة بين قائمة التنفيذ وصفحة الطلب ── */

/** عدد خطوات مسار التنفيذ المتتبَّعة في enforcementSteps */
const ENFORCEMENT_STEPS_COUNT = 22;

export const enforcementProgressOf = (c: any): number => {
  const steps = c.enforcementSteps || {};
  const done = Object.values(steps).filter(Boolean).length;
  return Math.round((done / ENFORCEMENT_STEPS_COUNT) * 100);
};

export const isEnforcementOverdue = (c: any): boolean =>
  !!c.enforcementNoticeDeadline &&
  !c.enforcementClosureReason &&
  new Date(c.enforcementNoticeDeadline).getTime() < Date.now();

export const executionStatusOf = (c: any): { label: string; dot: string; text: string; pill: string; bar: string; progress: string } => {
  if (c.enforcementClosureReason) return { label: "منتهي", dot: "bg-gray-400", text: "text-gray-500", pill: "bg-gray-100 text-gray-600", bar: "border-r-gray-300", progress: "bg-gray-400" };
  if (isEnforcementOverdue(c)) return { label: "متأخر", dot: "bg-red-500", text: "text-red-600", pill: "bg-red-50 text-red-700", bar: "border-r-red-500", progress: "bg-red-500" };
  return { label: "قيد التنفيذ", dot: "bg-blue-600", text: "text-gray-600", pill: "bg-blue-50 text-blue-700", bar: "border-r-edge-2", progress: "bg-navy-2" };
};
