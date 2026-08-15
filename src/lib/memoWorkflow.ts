/**
 * دورة اعتماد المذكرات واللوائح (المذكرات والصحف) — على غرار وحدة العقود
 * في contracts.ts، ومبنية على صلاحية "memo.manage" في مصفوفة الصلاحيات:
 * مدير المكتب «كامل» · الشريك «اعتماد» · محامي المكتب «إنشاء أو كامل
 * بحسب إعداد المكتب» · المستشار «مراجعة» · العميل «عرض» (إن شُورك معه).
 */

import type { Role } from "./roles";
import { canApprove, canUpdate, scopeOf } from "./permissions";

export type MemoStatus =
  | "DRAFT"             // مسودة
  | "UNDER_REVIEW"      // قيد مراجعة المستشار
  | "PENDING_APPROVAL"  // بانتظار اعتماد الشريك / صاحب المكتب
  | "APPROVED"          // معتمدة
  | "REJECTED"          // مرفوضة
  | "FILED";            // رُفعت للجلسة

export const MEMO_STATUS_LABELS_AR: Record<MemoStatus, string> = {
  DRAFT: "مسودة",
  UNDER_REVIEW: "قيد مراجعة المستشار",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  FILED: "مرفوعة للجلسة",
};

export const MEMO_STATUS_COLORS: Record<MemoStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-teal-100 text-teal-800",
  REJECTED: "bg-rose-100 text-rose-800",
  FILED: "bg-green-100 text-green-800",
};

/** الانتقالات المسموحة في آلة الحالات — أي انتقال خارجها مرفوض */
const TRANSITIONS: Record<MemoStatus, MemoStatus[]> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["PENDING_APPROVAL", "DRAFT", "REJECTED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "REJECTED"],
  APPROVED: ["FILED", "DRAFT"],
  REJECTED: ["DRAFT"],
  FILED: [],
};

export function canTransition(from: MemoStatus, to: MemoStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** الحالات التي يجوز فيها مشاركة المذكرة مع العميل قبل رفعها للجلسة */
const SHAREABLE: MemoStatus[] = ["UNDER_REVIEW", "PENDING_APPROVAL", "APPROVED", "FILED"];

export function canShareWithClient(status: MemoStatus): boolean {
  return SHAREABLE.includes(status);
}

/** مذكرات قديمة لا تحمل حقل status — تُعامل كمعتمدة حتى لا تُحجب عن الرفع فجأة */
export function statusOf(memo: { status?: MemoStatus | null }): MemoStatus {
  return memo.status ?? "APPROVED";
}

export interface MemoActions {
  canEdit: boolean;
  canSubmitForReview: boolean;
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canFile: boolean;
  canShare: boolean;
  canDelete: boolean;
}

export function memoActions(role: Role, status: MemoStatus): MemoActions {
  const scope = scopeOf(role, "memo.manage");
  const isFull = scope === "FULL";
  const isApprover = canApprove(role, "memo.manage"); // FULL أو APPROVE
  const isReviewer = scope === "REVIEW";
  const isCreator = scope === "CREATE" || scope === "DRAFT";
  const readOnly = scope === "VIEW" || scope === "NONE";

  const editableStatus = status === "DRAFT" || status === "UNDER_REVIEW" || status === "REJECTED";

  return {
    canEdit: !readOnly && canUpdate(role, "memo.manage") && (editableStatus || isFull),
    canSubmitForReview: (isFull || isCreator) && status === "DRAFT",
    canReview: (isFull || isReviewer) && status === "UNDER_REVIEW",
    canApprove: isApprover && status === "PENDING_APPROVAL",
    canReject: isApprover && (status === "PENDING_APPROVAL" || status === "UNDER_REVIEW"),
    canFile: (isFull || isCreator) && status === "APPROVED",
    canShare: !readOnly && canShareWithClient(status),
    canDelete: isFull,
  };
}
