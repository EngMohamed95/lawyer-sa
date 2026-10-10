/**
 * تصنيفات طلب التنفيذ كما في ناجز — تُحفظ على القضية في
 * enforcementRequestType و enforcementDeedType.
 * و«مضمون الطلب» (بيانات المبلغ والسند) في executionDetails.
 */

export const EXECUTION_REQUEST_TYPES = [
  "تنفيذ مباشر",
  "تنفيذ أحوال شخصية",
  "تنفيذ حكم أجنبي",
  "تنفيذ حكم تحكيم",
];

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

/** مضمون طلب التنفيذ — بيانات المبلغ والسند كما في ناجز */
export interface ExecutionDetails {
  /** المبلغ المدون في السند / المحكوم به */
  deedAmount: string;
  /** المبلغ المستلم */
  receivedAmount: string;
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
  deedAmount: "", receivedAmount: "", requestedAmount: "",
  deedDate: "", deedPlace: "السعودية", deedCity: "", paymentPlace: "", maturityStatus: "مستحق",
};

export function executionDetailsOf(c: any): ExecutionDetails {
  const src = c?.executionDetails && typeof c.executionDetails === "object" ? c.executionDetails : {};
  const out = { ...EMPTY_EXECUTION_DETAILS };
  for (const k of Object.keys(out) as (keyof ExecutionDetails)[]) {
    if (typeof src[k] === "string") out[k] = src[k];
  }
  return out;
}

const toNumber = (v: string) => {
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** المبلغ المتبقي = المدون في السند − المستلم */
export const remainingAmount = (d: ExecutionDetails) =>
  d.deedAmount ? Math.max(0, toNumber(d.deedAmount) - toNumber(d.receivedAmount)) : null;

export const formatMoney = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : toNumber(v);
  return `${n.toLocaleString("en-US")} ريال`;
};
