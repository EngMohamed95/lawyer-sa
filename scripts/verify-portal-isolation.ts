/**
 * اختبار عزل بوابة العميل — المعياران AC-2 و AC-7.
 *
 * يبني سجلات تحمل عمداً كل الحقول الحساسة، ويتحقق أن مُسلسِلات البوابة
 * لا تُمرّر منها شيئاً، وأن تزوير clientId لا يمنح وصولاً.
 *
 * التشغيل:  npx tsx scripts/verify-portal-isolation.ts
 */

import {
  assertNoLeaks, auditForLeaks, belongsToClient,
  serializeAppointment, serializeCase, serializeContract,
  serializeDocument, serializeHearing, serializeInvoice,
  visibleCases,
} from "../src/lib/portalSerializer";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const MINE = { clientId: "C1", lawyerId: "L1" };

/* ────────────────────────── سجلات ملغّمة ────────────────────────── */

const dirtyCase = {
  id: "K1", lawyerId: "L1", clientId: "C1",
  caseNumber: "1234/ج", title: "قضية العميل", type: "تجاري", status: "ACTIVE",
  courtName: "المحكمة التجارية", courtCircle: "الأولى", startDate: "2026-01-01",
  // ــ حقول يجب ألا تصل للعميل ــ
  internalNotes: "العميل متعثّر مالياً — نطلب دفعة مقدّمة",
  strategy: "الدفع بعدم الاختصاص ثم التسوية",
  summary: "ملخّص داخلي",
  assignedLawyerId: "U9", opponentLawyer: "أ. الخصم", opponentPhone: "0500000000",
  createdBy: "U9", margin: 0.4, aiSummary: "تحليل داخلي",
};

const dirtyHearing = {
  id: "H1", caseId: "K1", lawyerId: "L1",
  hearingDate: "2026-09-01", court: "المحكمة التجارية", circuit: "الأولى",
  minutesText: "محضر داخلي", judgmentText: "مسودة الحكم",
  requiredActions: "خطة المرافعة الداخلية", result: "تقييم داخلي",
  internalNotes: "لا تُطلع العميل",
};

const sharedDoc = {
  id: "D1", lawyerId: "L1", name: "توكيل", type: "POWER_OF_ATTORNEY",
  fileUrl: "https://x/y.pdf", fileType: "application/pdf", uploadDate: "2026-02-02",
  version: 2, sharedWithClient: true, status: "ACTIVE",
  storagePath: "tenants/L1/secret", checksum: "abc", uploadedBy: "U9",
  allowedRoles: ["LAWYER"], allowedUserIds: ["U9"], notes: "ملاحظة داخلية",
};

const privateDoc = { ...sharedDoc, id: "D2", sharedWithClient: false };
const archivedDoc = { ...sharedDoc, id: "D3", status: "ARCHIVED" };

const approvedContract = {
  id: "CT1", lawyerId: "L1", clientId: "C1", contractNumber: "CT-2026-0001",
  title: "اتفاقية أتعاب", type: "RETAINER", status: "APPROVED",
  startDate: "2026-01-01", endDate: "2026-12-31",
  totalValue: 11500, currency: "SAR", content: "بنود العقد",
  sharedWithClient: true,
  notes: "هامش الربح 40%", margin: 0.4, createdBy: "U9", internalNotes: "خصم ممكن",
};

const draftContract = { ...approvedContract, id: "CT2", status: "DRAFT" };
const unsharedContract = { ...approvedContract, id: "CT3", sharedWithClient: false };

const sentInvoice = {
  id: "I1", lawyerId: "L1", clientId: "C1", invoiceNumber: "INV-2026-0001",
  issueDate: "2026-03-01", dueDate: "2026-04-01", status: "SENT",
  items: [{ description: "أتعاب", quantity: 1, unitPrice: 10000, amount: 10000, taxable: true, cost: 2000 }],
  subtotal: 10000, vatRate: 15, vatAmount: 1500, total: 11500,
  paidAmount: 0, remainingAmount: 11500, currency: "SAR",
  sharedWithClient: true,
  notes: "العميل بطيء السداد", createdBy: "U9", margin: 0.35, internalNotes: "متابعة",
};

const draftInvoice = { ...sentInvoice, id: "I2", status: "DRAFT" };

const appointment = {
  id: "A1", lawyerId: "L1", clientId: "C1", title: "اجتماع", type: "CLIENT_MEETING",
  startAt: "2026-05-01T09:00:00Z", endAt: "2026-05-01T10:00:00Z", allDay: false,
  location: "المكتب", isOnline: false, meetingUrl: null, status: "SCHEDULED",
  description: "ملاحظات تحضير داخلية", organizerId: "U9", createdBy: "U9",
  internalNotes: "لا تُطلع العميل",
};

/* ────────────────────────── AC-2: لا تسريب حقول ────────────────────────── */

console.log("\n=== AC-2 — لا حقل محجوب في أي استجابة ===");

const sCase = serializeCase(dirtyCase);
check("القضية نظيفة", auditForLeaks(sCase).clean, auditForLeaks(sCase).leaked.join(", "));
check("القضية بلا استراتيجية", !("strategy" in sCase));
check("القضية بلا محامٍ مسؤول", !("assignedLawyerId" in sCase));
check("القضية تُبقي الحقول المسموحة", sCase.caseNumber === "1234/ج" && sCase.status === "ACTIVE");

const sHearing = serializeHearing(dirtyHearing);
check("الجلسة نظيفة", auditForLeaks(sHearing).clean);
check("الجلسة بلا محضر", !("minutesText" in sHearing));
check("الجلسة بلا مسودة حكم", !("judgmentText" in sHearing));
check("الجلسة بلا نتيجة داخلية", !("result" in sHearing));

const sDoc = serializeDocument(sharedDoc);
check("المستند المشارَك يُعرض", sDoc !== null);
check("المستند نظيف", sDoc !== null && auditForLeaks(sDoc).clean);
check("المستند بلا مسار تخزين", sDoc !== null && !("storagePath" in sDoc));
check("المستند بلا قوائم صلاحيات", sDoc !== null && !("allowedUserIds" in sDoc));

const sContract = serializeContract(approvedContract);
check("العقد المعتمد يُعرض", sContract !== null);
check("العقد نظيف", sContract !== null && auditForLeaks(sContract).clean);
check("العقد بلا هامش ربح", sContract !== null && !("margin" in sContract));

const sInvoice = serializeInvoice(sentInvoice);
check("الفاتورة المُرسَلة تُعرض", sInvoice !== null);
check("الفاتورة نظيفة", sInvoice !== null && auditForLeaks(sInvoice).clean);
check("بنود الفاتورة بلا تكلفة",
  sInvoice !== null && Array.isArray(sInvoice.items) &&
  !(sInvoice.items as Record<string, unknown>[]).some((it) => "cost" in it));

const sAppt = serializeAppointment(appointment);
check("الموعد نظيف", sAppt !== null && auditForLeaks(sAppt).clean);
check("الموعد بلا وصف داخلي", sAppt !== null && !("description" in sAppt));

/* ────────────────────────── حواجز العرض ────────────────────────── */

console.log("\n=== حواجز العرض — ما لا يُعرض أصلاً ===");
check("مستند غير مشارَك محجوب", serializeDocument(privateDoc) === null);
check("مستند مؤرشف محجوب", serializeDocument(archivedDoc) === null);
check("عقد مسودة محجوب", serializeContract(draftContract) === null);
check("عقد غير مشارَك محجوب", serializeContract(unsharedContract) === null);
check("فاتورة مسودة محجوبة", serializeInvoice(draftInvoice) === null);

/* ────────────────────────── AC-7 و AC-1: العزل ────────────────────────── */

console.log("\n=== AC-1 و AC-7 — عزل العميل والمكتب ===");

const otherClientCase = { ...dirtyCase, id: "K2", clientId: "C2" };
const otherTenantCase = { ...dirtyCase, id: "K3", lawyerId: "L2" };
const noClientCase = { ...dirtyCase, id: "K4", clientId: "" };

check("قضية عميل آخر مرفوضة", !belongsToClient(otherClientCase, MINE));
check("قضية مكتب آخر مرفوضة", !belongsToClient(otherTenantCase, MINE));
check("قضية بلا عميل مرفوضة", !belongsToClient(noClientCase, MINE));
check("قضية العميل مقبولة", belongsToClient(dirtyCase, MINE));

const pool = [dirtyCase, otherClientCase, otherTenantCase, noClientCase];
const mineOnly = visibleCases(pool, MINE);
check("الترشيح يُرجع قضية واحدة", mineOnly.length === 1, `أرجع ${mineOnly.length}`);
check("القضية المُرجَعة هي قضيته", mineOnly[0]?.id === "K1");

// تزوير clientId في الطلب لا ينفع: الهوية تأتي من التوكن
const forged = { clientId: "C2", lawyerId: "L1" };
check("تزوير clientId لا يكشف قضايا غيره",
  visibleCases(pool, forged).every((c) => String(c.clientId) === "C2"));
check("تزوير clientId لا يكشف قضية C1",
  !visibleCases(pool, forged).some((c) => c.id === "K1"));

// قائمة القضايا المسموحة تُضيّق ولا تُوسّع
const restricted = { ...MINE, allowedCaseIds: ["K9"] };
check("قائمة القضايا المسموحة تُضيّق", visibleCases(pool, restricted).length === 0);

/* ────────────────────────── الحارس الأخير ────────────────────────── */

console.log("\n=== الحارس الأخير ===");
let threw = false;
try {
  assertNoLeaks({ case: dirtyCase }, "حزمة ملغّمة");
} catch {
  threw = true;
}
check("assertNoLeaks يرمي عند التسريب", threw);

let threwClean = false;
try {
  assertNoLeaks({ case: sCase, hearings: [sHearing], invoice: sInvoice }, "حزمة نظيفة");
} catch {
  threwClean = true;
}
check("assertNoLeaks يمرّر الحزمة النظيفة", !threwClean);

console.log(
  failures === 0
    ? "\n✅ عزل البوابة سليم — لا تسريب ولا تجاوز"
    : `\n❌ ${failures} فحص فشل`,
);
process.exit(failures === 0 ? 0 : 1);
