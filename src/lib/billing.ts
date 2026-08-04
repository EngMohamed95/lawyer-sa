/**
 * الفوترة والسندات — الوثيقة §1.9 ودورة الاعتماد من §ثالثاً.
 *
 * لا يمسّ هذا الملف `payments` ولا `expenses` القائمَين إطلاقاً؛ الفواتير
 * والسندات كولكشنات جديدة تربطهما اختيارياً، فيعمل التقرير المالي القديم
 * والجديد معاً.
 *
 * ضوابط مطبَّقة هنا:
 *  - الترقيم التسلسلي عبر Firestore transaction — لا تكرار ولا فجوات (R2).
 *  - الضريبة تُحسب على مستوى البند لا الإجمالي، لدعم البنود المعفاة (R3).
 *  - آلة حالات تمنع الانتقالات غير المشروعة برمجياً لا بإخفاء الأزرار (R1).
 */

import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import { scopeOf } from "./permissions";
import type { Role } from "./roles";

/* ────────────────────────── الأنواع ────────────────────────── */

export type InvoiceStatus =
  | "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT"
  | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export type PaymentMethod = "CASH" | "BANK" | "CHEQUE" | "CARD" | "ONLINE";

export type VoucherCategory =
  | "COURT_FEE" | "EXPERT" | "TRANSPORT" | "SALARY" | "OFFICE" | "OTHER";

export type FeeModel =
  | "FIXED" | "HOURLY" | "RETAINER" | "CONTINGENCY" | "MILESTONE" | "MIXED";

export type DiscountType = "AMOUNT" | "PERCENT";

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** بند خاضع للضريبة — البنود المعفاة تُستثنى من وعاء الضريبة */
  taxable: boolean;
}

export interface Invoice {
  id: string;
  lawyerId: string;
  invoiceNumber: string;
  clientId: string | null;
  clientName?: string | null;
  caseId?: string | null;
  caseTitle?: string | null;
  caseNumber?: string | null;
  contractId?: string | null;
  feeAgreementId?: string | null;
  issueDate: string;
  dueDate: string | null;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  discountType: DiscountType;
  vatRate: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  currency: string;
  status: InvoiceStatus;
  approvedBy?: { uid: string; name: string; at: string } | null;
  zatca?: { uuid: string; hash: string | null; qrCode: string | null; status: string } | null;
  notes?: string | null;
  sharedWithClient: boolean;
  createdAt: string;
  createdBy: string | null;
  createdByName?: string | null;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Receipt {
  id: string;
  lawyerId: string;
  receiptNumber: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  clientId: string | null;
  clientName?: string | null;
  caseId?: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference?: string | null;
  date: string;
  receivedBy?: string | null;
  notes?: string | null;
  paymentId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface Voucher {
  id: string;
  lawyerId: string;
  voucherNumber: string;
  payeeType: string;
  payeeId?: string | null;
  payeeName: string;
  amount: number;
  currency: string;
  category: VoucherCategory;
  method: PaymentMethod;
  reference?: string | null;
  date: string;
  caseId?: string | null;
  caseTitle?: string | null;
  approvedBy?: { uid: string; name: string; at: string } | null;
  expenseId?: string | null;
  notes?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export type AgreementStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "TERMINATED";

export interface Milestone {
  title: string;
  amount: number;
  dueDate: string | null;
  status: "PENDING" | "INVOICED" | "PAID";
  invoiceId?: string | null;
}

export interface FeeAgreement {
  id: string;
  lawyerId: string;
  agreementNumber: string;
  clientId: string | null;
  clientName?: string | null;
  caseId?: string | null;
  caseTitle?: string | null;
  caseNumber?: string | null;
  contractId?: string | null;
  model: FeeModel;
  fixedAmount?: number | null;
  hourlyRate?: number | null;
  retainerMonthly?: number | null;
  contingencyPercent?: number | null;
  milestones?: Milestone[];
  totalAgreed: number;
  totalInvoiced: number;
  totalCollected: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  status: AgreementStatus;
  notes?: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface TimeEntry {
  id: string;
  lawyerId: string;
  userId: string | null;
  userName?: string | null;
  caseId: string | null;
  caseTitle?: string | null;
  caseNumber?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  feeAgreementId?: string | null;
  date: string;
  hours: number;
  rate: number;
  amount: number;
  description: string;
  billable: boolean;
  invoiceId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

/* ────────────────────────── التسميات العربية ────────────────────────── */

export const AGREEMENT_STATUS_LABELS_AR: Record<AgreementStatus, string> = {
  DRAFT: "مسودة",
  ACTIVE: "سارية",
  COMPLETED: "منتهية",
  TERMINATED: "مفسوخة",
};

export const AGREEMENT_STATUS_COLORS: Record<AgreementStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-green-100 text-green-800",
  COMPLETED: "bg-blue-100 text-blue-800",
  TERMINATED: "bg-rose-100 text-rose-900",
};


export const INVOICE_STATUS_LABELS_AR: Record<InvoiceStatus, string> = {
  DRAFT: "مسودة",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  APPROVED: "معتمدة",
  SENT: "أُرسلت للعميل",
  PARTIALLY_PAID: "مدفوعة جزئياً",
  PAID: "مدفوعة بالكامل",
  OVERDUE: "متأخرة",
  CANCELLED: "ملغاة",
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-teal-100 text-teal-800",
  SENT: "bg-blue-100 text-blue-800",
  PARTIALLY_PAID: "bg-indigo-100 text-indigo-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
  CANCELLED: "bg-rose-100 text-rose-900",
};

export const PAYMENT_METHOD_LABELS_AR: Record<PaymentMethod, string> = {
  CASH: "نقداً",
  BANK: "تحويل بنكي",
  CHEQUE: "شيك",
  CARD: "بطاقة",
  ONLINE: "دفع إلكتروني",
};

export const VOUCHER_CATEGORY_LABELS_AR: Record<VoucherCategory, string> = {
  COURT_FEE: "رسوم قضائية",
  EXPERT: "أتعاب خبير",
  TRANSPORT: "انتقالات",
  SALARY: "رواتب",
  OFFICE: "مصروفات مكتبية",
  OTHER: "أخرى",
};

export const FEE_MODEL_LABELS_AR: Record<FeeModel, string> = {
  FIXED: "مبلغ مقطوع",
  HOURLY: "بالساعة",
  RETAINER: "أتعاب شهرية",
  CONTINGENCY: "نسبة من المحكوم به",
  MILESTONE: "على مراحل",
  MIXED: "مختلط",
};

/* ────────────────────────── آلة الحالات (R1) ────────────────────────── */

const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** الفاتورة لا تُشارك مع العميل قبل اعتمادها — نفس ضابط العقود */
const SHAREABLE: InvoiceStatus[] = ["APPROVED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

export function canShareWithClient(status: InvoiceStatus): boolean {
  return SHAREABLE.includes(status);
}

export interface InvoiceActions {
  canEdit: boolean;
  canSubmitForApproval: boolean;
  canApprove: boolean;
  canSend: boolean;
  canRecordPayment: boolean;
  canCancel: boolean;
  canDelete: boolean;
  canShare: boolean;
}

const NO_ACTIONS: InvoiceActions = {
  canEdit: false, canSubmitForApproval: false, canApprove: false, canSend: false,
  canRecordPayment: false, canCancel: false, canDelete: false, canShare: false,
};

/**
 * ما يستطيعه هذا الدور على فاتورة بهذه الحالة.
 * المصفوفة: المحاسب FULL · الشريك APPROVE · المحامي VIEW · العميل PAY.
 */
export function invoiceActions(role: Role | null, status: InvoiceStatus): InvoiceActions {
  if (!role) return NO_ACTIONS;
  const scope = scopeOf(role, "invoice.manage");
  if (scope === "NONE") return NO_ACTIONS;

  const full = scope === "FULL";
  const approver = scope === "APPROVE" || full;
  const closed = status === "PAID" || status === "CANCELLED";

  return {
    canEdit: full && status === "DRAFT",
    canSubmitForApproval: full && status === "DRAFT",
    canApprove: approver && status === "PENDING_APPROVAL",
    canSend: full && status === "APPROVED",
    canRecordPayment: full && ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(status),
    // الإلغاء لمدير المكتب فقط (FULL) وليس للشريك — الوثيقة R1
    canCancel: full && !closed,
    canDelete: full && status === "DRAFT",
    canShare: full && canShareWithClient(status),
  };
}

export function canCreateInvoice(role: Role | null): boolean {
  if (!role) return false;
  return scopeOf(role, "invoice.manage") === "FULL";
}

/* ────────────────────────── الترقيم التسلسلي (R2) ────────────────────────── */

const PREFIX = {
  invoices: "INV",
  receipts: "RCP",
  vouchers: "VCH",
  fee_agreements: "FA",
} as const;

export type NumberedScope = keyof typeof PREFIX;

/**
 * رقم تسلسلي فريد لكل مكتب لكل سنة.
 * يعمل داخل معاملة، فإنشاء متزامن من جهازين لا يُنتج رقماً مكرراً.
 */
export async function nextNumber(lawyerId: string, scope: NumberedScope): Promise<string> {
  if (!lawyerId) throw new Error("تعذّر تحديد المكتب لتوليد الرقم");
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `${lawyerId}_${scope}_${year}`);

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lawyerId, scope, year, value: next }, { merge: true });
    return next;
  });

  return `${PREFIX[scope]}-${year}-${String(seq).padStart(4, "0")}`;
}

/* ────────────────────────── الحسابات (R3) ────────────────────────── */

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export interface InvoiceTotals {
  subtotal: number;
  taxableBase: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
}

/**
 * الضريبة تُحسب على وعاء البنود الخاضعة فقط، بعد توزيع الخصم عليها بالتناسب.
 * هذا يختلف عن ضرب الإجمالي في النسبة، ويهمّ متى وُجد بند معفى.
 */
export function computeInvoiceTotals(
  items: InvoiceItem[],
  vatRate: number,
  discount = 0,
  discountType: DiscountType = "AMOUNT",
): InvoiceTotals {
  const lines = items.map((it) => ({
    ...it,
    amount: round2((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
  }));

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxableBase = round2(lines.filter((l) => l.taxable).reduce((s, l) => s + l.amount, 0));

  const discountAmount = round2(
    discountType === "PERCENT"
      ? (subtotal * (Number(discount) || 0)) / 100
      : Math.min(Number(discount) || 0, subtotal),
  );

  // الخصم يُوزَّع بالتناسب، فينخفض وعاء الضريبة بنفس النسبة
  const share = subtotal > 0 ? taxableBase / subtotal : 0;
  const taxableAfterDiscount = round2(taxableBase - discountAmount * share);

  const vatAmount = round2((taxableAfterDiscount * (Number(vatRate) || 0)) / 100);
  const total = round2(subtotal - discountAmount + vatAmount);

  return { subtotal, taxableBase, discountAmount, vatAmount, total };
}

export function emptyItem(): InvoiceItem {
  return { description: "", quantity: 1, unitPrice: 0, amount: 0, taxable: true };
}

/** الحالة الصحيحة بعد تسجيل دفعة — تُشتق من المبالغ لا تُكتب يدوياً */
export function statusAfterPayment(
  current: InvoiceStatus,
  total: number,
  paidAmount: number,
  dueDate: string | null,
): InvoiceStatus {
  if (current === "CANCELLED") return current;
  if (round2(paidAmount) >= round2(total)) return "PAID";
  if (paidAmount > 0) return "PARTIALLY_PAID";
  if (isOverdue(dueDate)) return "OVERDUE";
  return current;
}

export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

/** الحالة المعروضة: تُظهر «متأخرة» دون تعديل السجل في قاعدة البيانات */
export function displayStatus(inv: Pick<Invoice, "status" | "dueDate">): InvoiceStatus {
  const active: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID"];
  if (active.includes(inv.status) && isOverdue(inv.dueDate)) return "OVERDUE";
  return inv.status;
}

/* ────────────────────────── أعمار الديون (R4) ────────────────────────── */

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export const AGING_LABELS_AR: Record<AgingBucket, string> = {
  "0-30": "حتى ٣٠ يوم",
  "31-60": "٣١–٦٠ يوم",
  "61-90": "٦١–٩٠ يوم",
  "90+": "أكثر من ٩٠ يوم",
};

export function daysOverdue(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const diff = Date.now() - new Date(dueDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function agingBucket(dueDate: string | null | undefined): AgingBucket {
  const d = daysOverdue(dueDate);
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

export interface AgingRow {
  clientId: string;
  clientName: string;
  buckets: Record<AgingBucket, number>;
  total: number;
}

/** يجمّع المستحق غير المسدَّد حسب العميل وفئة التقادم */
export function buildAging(invoices: Invoice[]): { rows: AgingRow[]; totals: Record<AgingBucket, number>; grandTotal: number } {
  const byClient = new Map<string, AgingRow>();
  const totals: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };

  for (const inv of invoices) {
    if (inv.status === "CANCELLED" || inv.status === "PAID" || inv.status === "DRAFT") continue;
    const remaining = round2(Number(inv.remainingAmount) || 0);
    if (remaining <= 0) continue;

    const key = inv.clientId ?? "—";
    if (!byClient.has(key)) {
      byClient.set(key, {
        clientId: key,
        clientName: inv.clientName || "عميل غير محدد",
        buckets: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
        total: 0,
      });
    }
    const row = byClient.get(key)!;
    const bucket = agingBucket(inv.dueDate);
    row.buckets[bucket] = round2(row.buckets[bucket] + remaining);
    row.total = round2(row.total + remaining);
    totals[bucket] = round2(totals[bucket] + remaining);
  }

  const rows = [...byClient.values()].sort((a, b) => b.total - a.total);
  const grandTotal = round2(rows.reduce((s, r) => s + r.total, 0));
  return { rows, totals, grandTotal };
}

/* ────────────────────────── اتفاقيات الأتعاب ────────────────────────── */

/**
 * المبلغ المتفق عليه يُشتق من نموذج الأتعاب لا يُكتب يدوياً،
 * حتى لا يتناقض الحقل مع النموذج المختار.
 */
export function computeAgreedTotal(a: {
  model: FeeModel;
  fixedAmount?: number | null;
  retainerMonthly?: number | null;
  milestones?: Milestone[] | null;
  startDate?: string | null;
  endDate?: string | null;
}): number {
  switch (a.model) {
    case "FIXED":
      return round2(Number(a.fixedAmount) || 0);
    case "MILESTONE":
      return round2((a.milestones ?? []).reduce((s, m) => s + (Number(m.amount) || 0), 0));
    case "RETAINER": {
      const monthly = Number(a.retainerMonthly) || 0;
      const months = monthsBetween(a.startDate, a.endDate);
      return round2(monthly * (months || 1));
    }
    // بالساعة والنسبة والمختلط: المبلغ غير معروف مسبقاً
    default:
      return 0;
  }
}

function monthsBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(0, months);
}

/** الملخّص المالي للاتفاقية بعد احتساب ما فُوتر وما حُصّل */
export function agreementProgress(a: Pick<FeeAgreement, "totalAgreed" | "totalInvoiced" | "totalCollected">) {
  const agreed = round2(Number(a.totalAgreed) || 0);
  const invoiced = round2(Number(a.totalInvoiced) || 0);
  const collected = round2(Number(a.totalCollected) || 0);
  return {
    agreed, invoiced, collected,
    remaining: round2(Math.max(0, agreed - collected)),
    // النسبة بلا قسمة على صفر
    percent: agreed > 0 ? Math.min(100, Math.round((collected / agreed) * 100)) : 0,
  };
}

/* ────────────────────────── تسجيل الساعات ────────────────────────── */

export function timeEntryAmount(hours: number, rate: number): number {
  return round2((Number(hours) || 0) * (Number(rate) || 0));
}

export interface TimeSummary {
  totalHours: number;
  billableHours: number;
  billableAmount: number;
  unbilledAmount: number;
}

/** ملخّص الساعات — يفصل القابل للفوترة عمّا فُوتر بالفعل */
export function summarizeTime(entries: TimeEntry[]): TimeSummary {
  let totalHours = 0, billableHours = 0, billableAmount = 0, unbilledAmount = 0;
  for (const e of entries) {
    const h = Number(e.hours) || 0;
    totalHours += h;
    if (!e.billable) continue;
    billableHours += h;
    const amt = Number(e.amount) || timeEntryAmount(h, e.rate);
    billableAmount += amt;
    if (!e.invoiceId) unbilledAmount += amt;
  }
  return {
    totalHours: round2(totalHours),
    billableHours: round2(billableHours),
    billableAmount: round2(billableAmount),
    unbilledAmount: round2(unbilledAmount),
  };
}

/** يحوّل سجلات ساعات إلى بنود فاتورة — بند لكل قضية */
export function timeEntriesToItems(entries: TimeEntry[]): InvoiceItem[] {
  const byCase = new Map<string, { hours: number; amount: number; label: string }>();
  for (const e of entries) {
    if (!e.billable || e.invoiceId) continue;
    const key = e.caseId ?? "—";
    const label = e.caseTitle || "أعمال عامة";
    const cur = byCase.get(key) ?? { hours: 0, amount: 0, label };
    cur.hours += Number(e.hours) || 0;
    cur.amount += Number(e.amount) || timeEntryAmount(e.hours, e.rate);
    byCase.set(key, cur);
  }
  return [...byCase.values()].map((v) => ({
    description: `أتعاب بالساعة — ${v.label} (${round2(v.hours)} ساعة)`,
    quantity: round2(v.hours),
    unitPrice: v.hours > 0 ? round2(v.amount / v.hours) : 0,
    amount: round2(v.amount),
    taxable: true,
  }));
}

/* ────────────────────────── الفوترة الإلكترونية (R3) ────────────────────────── */

/** مفتاح الإعدادات القائم — لا نُفعّل شيئاً ما لم يُفعّله المكتب */
export function zatcaEnabled(): boolean {
  return localStorage.getItem("sys_zatcaEnabled") === "true";
}

/** UUID بمولّد المتصفح متى توفّر، مع بديل آمن للنسخ القديمة */
function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * ترميز TLV لرمز QR وفق متطلبات هيئة الزكاة والضريبة (المرحلة الأولى).
 * الحقول الخمسة: اسم البائع · الرقم الضريبي · الطابع الزمني · الإجمالي · الضريبة.
 */
export function buildZatcaQr(fields: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: number;
  vatAmount: number;
}): string {
  const enc = new TextEncoder();
  const parts: number[] = [];
  const values = [
    fields.sellerName,
    fields.vatNumber,
    fields.timestamp,
    String(fields.total),
    String(fields.vatAmount),
  ];
  values.forEach((value, i) => {
    const bytes = enc.encode(value);
    parts.push(i + 1, bytes.length, ...bytes);
  });
  let binary = "";
  for (const b of parts) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** بنية zatca المخزَّنة مع الفاتورة — تُملأ فقط متى فُعِّلت الخاصية */
export function buildZatcaBlock(total: number, vatAmount: number): Invoice["zatca"] {
  if (!zatcaEnabled()) return null;
  const sellerName = localStorage.getItem("sys_officeName") || localStorage.getItem("userName") || "";
  const vatNumber = localStorage.getItem("sys_vatNumber") || "";
  const timestamp = new Date().toISOString();
  return {
    uuid: uuid(),
    hash: null, // يُحسب عند الربط الفعلي بالهيئة
    qrCode: buildZatcaQr({ sellerName, vatNumber, timestamp, total, vatAmount }),
    status: "PENDING",
  };
}
