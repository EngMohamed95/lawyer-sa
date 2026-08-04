/**
 * وحدة العقود — الوثيقة §1.5:
 * «إنشاء العقود · قوالب جاهزة · التوقيع الإلكتروني · إدارة النسخ والمرفقات والتجديد»
 *
 * ودورة الاعتماد من مصفوفة الصلاحيات §ثالثاً:
 * مدير المكتب «كامل» · الشريك «اعتماد» · المحامي «إنشاء» · المستشار «مراجعة» · العميل «عرض»
 */

import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import type { Role } from "./roles";
import { canApprove, canCreate, canUpdate, scopeOf } from "./permissions";

export type ContractStatus =
  | "DRAFT"             // مسودة
  | "UNDER_REVIEW"      // قيد مراجعة المستشار
  | "PENDING_APPROVAL"  // بانتظار اعتماد الشريك/المدير
  | "APPROVED"          // معتمد
  | "SENT"              // أُرسل للعميل
  | "SIGNED"            // موقّع
  | "ACTIVE"            // ساري
  | "EXPIRED"           // منتهٍ
  | "TERMINATED"        // مفسوخ
  | "REJECTED";         // مرفوض

export type ContractType =
  | "RETAINER" | "SERVICE" | "NDA" | "SETTLEMENT" | "EMPLOYMENT" | "OTHER";

export type RenewalType = "NONE" | "AUTO" | "MANUAL";

export interface Contract {
  id: string;
  lawyerId: string;
  contractNumber: string;
  title: string;
  type: ContractType;
  clientId: string | null;
  clientName?: string | null;
  caseId?: string | null;
  /** لقطة من اسم/رقم القضية وقت الربط — تُغني عن استعلام إضافي في القوائم */
  caseTitle?: string | null;
  caseNumber?: string | null;
  content: string;
  value: number;
  currency: string;
  vatRate: number;
  vatAmount: number;
  totalValue: number;
  startDate: string | null;
  endDate: string | null;
  renewalType: RenewalType;
  renewalNoticeDays: number;
  status: ContractStatus;
  version: number;
  reviewedBy?: { uid: string; name: string; at: string; notes?: string } | null;
  approvedBy?: { uid: string; name: string; at: string } | null;
  rejectionReason?: string | null;
  sharedWithClient: boolean;
  notes?: string | null;
  createdAt: string;
  createdBy: string | null;
  createdByName?: string | null;
  updatedAt: string;
  deletedAt?: string | null;
}

export const CONTRACT_STATUS_LABELS_AR: Record<ContractStatus, string> = {
  DRAFT: "مسودة",
  UNDER_REVIEW: "قيد المراجعة",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  APPROVED: "معتمد",
  SENT: "أُرسل للعميل",
  SIGNED: "موقّع",
  ACTIVE: "ساري",
  EXPIRED: "منتهٍ",
  TERMINATED: "مفسوخ",
  REJECTED: "مرفوض",
};

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-teal-100 text-teal-800",
  SENT: "bg-blue-100 text-blue-800",
  SIGNED: "bg-emerald-100 text-emerald-800",
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-orange-100 text-orange-800",
  TERMINATED: "bg-red-100 text-red-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

export const CONTRACT_TYPE_LABELS_AR: Record<ContractType, string> = {
  RETAINER: "اتفاقية أتعاب",
  SERVICE: "عقد خدمات",
  NDA: "اتفاقية سرية",
  SETTLEMENT: "عقد تسوية",
  EMPLOYMENT: "عقد عمل",
  OTHER: "أخرى",
};

export const RENEWAL_LABELS_AR: Record<RenewalType, string> = {
  NONE: "بلا تجديد",
  AUTO: "تجديد تلقائي",
  MANUAL: "تجديد يدوي",
};

/** الانتقالات المسموحة في آلة الحالات — أي انتقال خارجها مرفوض */
const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["UNDER_REVIEW", "PENDING_APPROVAL", "TERMINATED"],
  UNDER_REVIEW: ["PENDING_APPROVAL", "DRAFT", "REJECTED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "REJECTED"],
  APPROVED: ["SENT", "DRAFT"],
  SENT: ["SIGNED", "REJECTED", "APPROVED"],
  SIGNED: ["ACTIVE"],
  ACTIVE: ["EXPIRED", "TERMINATED"],
  EXPIRED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
  REJECTED: ["DRAFT"],
};

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * الحالات التي يجوز فيها مشاركة العقد مع العميل.
 * ضابط الوثيقة §خامساً: «إلزام اعتماد العقود قبل مشاركتها مع العميل».
 */
const SHAREABLE: ContractStatus[] = ["APPROVED", "SENT", "SIGNED", "ACTIVE", "EXPIRED"];

export function canShareWithClient(status: ContractStatus): boolean {
  return SHAREABLE.includes(status);
}

/** ما الإجراءات المتاحة لهذا الدور على عقد بهذه الحالة؟ */
export interface ContractActions {
  canEdit: boolean;
  canSubmitForReview: boolean;
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canSend: boolean;
  canMarkSigned: boolean;
  canTerminate: boolean;
  canDelete: boolean;
  canShare: boolean;
}

export function contractActions(role: Role, status: ContractStatus): ContractActions {
  const scope = scopeOf(role, "contract.manage");
  const isFull = scope === "FULL";
  const isApprover = canApprove(role, "contract.manage");   // FULL أو APPROVE
  const isReviewer = scope === "REVIEW";
  const isCreator = scope === "CREATE";
  const readOnly = scope === "VIEW" || scope === "NONE";

  // المسودة والمراجعة قابلتان للتحرير؛ بعد الاعتماد يقتصر التحرير على مدير المكتب
  const editableStatus = status === "DRAFT" || status === "UNDER_REVIEW" || status === "REJECTED";

  return {
    canEdit: !readOnly && canUpdate(role, "contract.manage") && (editableStatus || isFull),
    canSubmitForReview: (isFull || isCreator) && status === "DRAFT",
    canReview: (isFull || isReviewer) && status === "UNDER_REVIEW",
    canApprove: isApprover && status === "PENDING_APPROVAL",
    canReject: isApprover && (status === "PENDING_APPROVAL" || status === "UNDER_REVIEW" || status === "SENT"),
    canSend: (isFull || isCreator) && status === "APPROVED",
    canMarkSigned: (isFull || isCreator) && status === "SENT",
    canTerminate: isFull && canTransition(status, "TERMINATED"),
    canDelete: isFull,
    canShare: !readOnly && canShareWithClient(status),
  };
}

export function canCreateContract(role: Role): boolean {
  return canCreate(role, "contract.manage");
}

/**
 * ترقيم تسلسلي آمن: CT-YYYY-NNNN
 * يستخدم معاملة على مستند عدّاد لكل مكتب لكل سنة، فلا يتكرر رقم
 * حتى مع إنشاء عقدين في نفس اللحظة من جهازين مختلفين.
 */
export async function nextContractNumber(lawyerId: string): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, "counters", `${lawyerId}_contracts_${year}`);

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lawyerId, scope: "contracts", year, value: next }, { merge: true });
    return next;
  });

  return `CT-${year}-${String(seq).padStart(4, "0")}`;
}

/** حساب الضريبة والإجمالي — على مستوى العقد */
export function computeTotals(value: number, vatRate: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeRate = Number.isFinite(vatRate) ? vatRate : 0;
  const vatAmount = Math.round(safeValue * (safeRate / 100) * 100) / 100;
  return { vatAmount, totalValue: Math.round((safeValue + vatAmount) * 100) / 100 };
}

/** أيام متبقية على انتهاء العقد (سالب = منتهٍ) */
export function daysUntilExpiry(endDate: string | null): number | null {
  if (!endDate) return null;
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}

/** هل يجب التنبيه على قرب انتهاء العقد؟ */
export function isExpiringSoon(c: Pick<Contract, "endDate" | "renewalNoticeDays" | "status">): boolean {
  if (c.status !== "ACTIVE" && c.status !== "SIGNED") return false;
  const days = daysUntilExpiry(c.endDate);
  return days !== null && days >= 0 && days <= (c.renewalNoticeDays || 30);
}
