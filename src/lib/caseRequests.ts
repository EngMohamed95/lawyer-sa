/**
 * طلبات القضية (مثل ناجز: إيداع مذكرة، حضور عن بعد، نسخة من الأحكام…).
 * تُحفظ في «cases/{id}/requests» فترث صلاحيات القضية الأم في قواعد Firestore.
 */

export type RequestStatus = "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CANCELLED";
export type CourtDegree = "FIRST" | "APPEAL" | "SUPREME";

export interface CaseRequest {
  id: string;
  caseId: string;
  type: string;
  requestNumber: string;
  status: RequestStatus;
  court: string;
  circuit: string;
  /** YYYY-MM-DD */
  requestDate: string;
  /** موعد الرد أو المتابعة — يظهر في التقويم. YYYY-MM-DD أو فارغ */
  followUpDate: string;
  degree: CourtDegree;
  notes: string;
  /** ملفات الطلب (صحيفة، مذكرة، مستندات مؤيدة) — رابط من upload.php */
  attachments?: { name: string; url: string; fileName?: string; date?: string }[];
  createdAt?: string;
  updatedAt?: string;
}

/** الأنواع الشائعة في ناجز — الحقل يقبل أي نص آخر */
export const REQUEST_TYPES = [
  "طلب إيداع مذكرة",
  "طلب حضور جلسة عن بعد",
  "طلب نسخة من الأحكام",
  "طلب تصحيح أو تعديل",
  "طلب تأجيل جلسة",
  "طلب إدخال طرف",
  "طلب ترك الدعوى",
  "طلب استئناف",
  "طلب التماس إعادة نظر",
  "طلب مستعجل",
  "طلب تنفيذ",
];

export const REQUEST_STATUS_LABELS_AR: Record<RequestStatus, string> = {
  SUBMITTED: "مقدَّم",
  UNDER_REVIEW: "قيد الدراسة",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
  CANCELLED: "ملغى",
};

export const REQUEST_STATUS_CLASS: Record<RequestStatus, string> = {
  SUBMITTED: "text-blue-700",
  UNDER_REVIEW: "text-amber-700",
  ACCEPTED: "text-gray-900",
  REJECTED: "text-red-700",
  CANCELLED: "text-gray-400 line-through",
};

export const COURT_DEGREE_LABELS_AR: Record<CourtDegree, string> = {
  FIRST: "الدرجة الأولى",
  APPEAL: "الاستئناف",
  SUPREME: "المحكمة العليا",
};

/** الطلب ما زال ينتظر رداً — وحدها هذه تستحق تذكير المتابعة في التقويم */
export const isOpenRequest = (r: Pick<CaseRequest, "status">) =>
  r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";
