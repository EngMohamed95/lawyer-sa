/**
 * ربط المستندات من نوع «عقد» بمديول العقود العام.
 *
 * المستند يبقى مستنداً في ملف القضية أو العميل كما هو؛ هذه الدالة تُنشئ
 * له سجل عقد مقابلاً في `contracts` وتربط الاتجاهين:
 *   - المستند يحمل `contractId`
 *   - العقد يحمل `documentId` و`documentPath` و`fileUrl`
 *
 * تُستخدم من موضعين: عند الرفع (AddDocumentModal) وعلى مستند قائم
 * لم يُربط بعد (زر «أضِفه للعقود» في صفحة المستندات).
 */

import { addDoc, collection, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { nextContractNumber } from "./contracts";
import { writeAudit } from "./audit";

export interface DocumentRef {
  /** مسار المستند: ["cases", caseId, "documents", docId] أو ["clients", ...] */
  path: string[];
  id: string;
  name: string;
  fileUrl?: string | null;
  fileType?: string | null;
  content?: string | null;
  notes?: string | null;
}

export interface LinkContext {
  lawyerId: string;
  clientId?: string | null;
  caseId?: string | null;
  userId?: string | null;
}

export interface LinkResult {
  contractId: string;
  contractNumber: string;
}

/**
 * يُنشئ سجل عقد من مستند ويربط الاتجاهين.
 * يرمي عند الفشل — المُستدعي يقرر هل يُفشل العملية كلها أم يكتفي بتنبيه.
 */
export async function createContractFromDocument(
  document: DocumentRef,
  ctx: LinkContext,
): Promise<LinkResult> {
  if (!ctx.lawyerId) throw new Error("تعذّر تحديد المكتب");

  // نقرأ اسم العميل ورقم القضية لتظهر في قائمة العقود بلا استعلام إضافي
  let clientName: string | null = null;
  let caseTitle: string | null = null;
  let caseNumber: string | null = null;

  if (ctx.clientId) {
    const snap = await getDoc(doc(db, "clients", ctx.clientId));
    if (snap.exists()) {
      const c = snap.data();
      clientName = (c.fullName as string) || (c.name as string) || null;
    }
  }
  if (ctx.caseId) {
    const snap = await getDoc(doc(db, "cases", ctx.caseId));
    if (snap.exists()) {
      const c = snap.data();
      caseTitle = (c.title as string) || (c.caseNumber as string) || null;
      caseNumber = (c.caseNumber as string) || null;
    }
  }

  const contractNumber = await nextContractNumber(ctx.lawyerId);
  const now = new Date().toISOString();

  const contractRef = await addDoc(collection(db, "contracts"), {
    lawyerId: ctx.lawyerId,
    contractNumber,
    title: document.name || "عقد",
    type: "OTHER",
    clientId: ctx.clientId ?? null,
    clientName,
    caseId: ctx.caseId ?? null,
    caseTitle,
    caseNumber,
    content: document.content || "",
    value: 0,
    currency: localStorage.getItem("sys_currency") || "SAR",
    vatRate: 0,
    vatAmount: 0,
    totalValue: 0,
    startDate: null,
    endDate: null,
    renewalType: "NONE",
    renewalNoticeDays: 30,
    status: "DRAFT",
    version: 1,
    reviewedBy: null,
    approvedBy: null,
    rejectionReason: null,
    sharedWithClient: false,
    notes: document.notes || null,
    // مصدر العقد — الملف المرفوع نفسه
    fileUrl: document.fileUrl ?? null,
    fileType: document.fileType ?? null,
    sourceDocumentName: document.name,
    documentId: document.id,
    documentPath: document.path.join("/"),
    createdAt: now,
    createdBy: ctx.userId ?? null,
    createdByName: localStorage.getItem("userName") ?? null,
    updatedAt: now,
    deletedAt: null,
  });

  // الاتجاه المعاكس: المستند يعرف عقده
  try {
    await updateDoc(doc(db, document.path[0], ...document.path.slice(1)), {
      contractId: contractRef.id,
      contractNumber,
    });
  } catch (err) {
    // العقد أُنشئ بالفعل؛ فشل وسم المستند لا يُبطله
    console.warn("تعذّر وسم المستند برقم العقد:", err);
  }

  await writeAudit({
    action: "CREATE", entity: "contract", entityId: contractRef.id,
    entityLabel: `${contractNumber} — ${document.name}`,
    after: {
      المصدر: "مستند نوعه عقد",
      العميل: clientName,
      القضية: caseTitle ?? "غير مرتبط",
    },
  });

  return { contractId: contractRef.id, contractNumber };
}
