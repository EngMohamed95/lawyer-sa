import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { ChevronRight, UsersRound, Archive, Calendar, FileText, CheckSquare, Plus, Download, Edit, Save, Trash2, File, Scale, FileSignature, Sparkles, RefreshCw, UploadCloud, Chrome, Info, CheckCircle2, Loader2, ChevronDown, ChevronUp, AlertTriangle, Gavel, Eye, Landmark, Banknote, FileBarChart, Printer, MessageCircle, ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AiSummarizerModal } from "../components/AiSummarizerModal";
import { AddDocumentModal } from "../components/AddDocumentModal";
import { AddHearingModal } from "../components/AddHearingModal";
import { AddTaskModal } from "../components/AddTaskModal";
import { EditCaseModal } from "../components/EditCaseModal";
import { DocumentViewerModal } from "../components/DocumentViewerModal";
import { EditHearingModal } from "../components/EditHearingModal";
import HearingCard from "../components/HearingCard";
import CaseParties, { partiesOf, type CaseParty } from "../components/CaseParties";
import CaseRequests from "../components/CaseRequests";
import MemoAiPanel from "../components/MemoAiPanel";
import { CLIENT_ROLE_LABELS_AR, clientRoleOf } from "../lib/clientRole";
import CaseClaimSection, { claimSectionOf, type ClaimSectionValue } from "../components/CaseClaimSection";
import CaseDecisions, { decisionsOf, type CaseDecision } from "../components/CaseDecisions";
import CaseJudgments, { judgmentsOf, legacyFinalJudgment, type CaseJudgment } from "../components/CaseJudgments";
import { EXECUTION_DEED_TYPES, EXECUTION_REQUEST_TYPES } from "../lib/execution";
import { AiMemoDrafterModal } from "../components/AiMemoDrafterModal";
import { HearingSelectModal } from "../components/HearingSelectModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import RichTextEditor from "../components/RichTextEditor";
import { Input } from "../components/ui/input";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, query, where, deleteField } from "firebase/firestore";
import { db } from "../lib/firebase";
import Documents from "./Documents";
import { usePermissions } from "../lib/usePermissions";
import { useOfficeSettings } from "../lib/officeSettings";
import {
  renderLetterheadHeader, renderLetterheadFooter,
  renderLetterheadHeaderWordSafe, renderLetterheadFooterWordSafe,
} from "../lib/letterhead";
import { writeAudit } from "../lib/audit";
import {
  MEMO_STATUS_COLORS, MEMO_STATUS_LABELS_AR, memoActions, statusOf,
  type MemoStatus,
} from "../lib/memoWorkflow";


const enforcementStepsList = [
  { id: 1, label: "تقديم طلب التنفيذ إلكترونيًا عبر منصة ناجز", stage: "SUBMISSION" },
  { id: 2, label: "إرفاق السند التنفيذي (حكم قضائي، حكم تحكيم، سند لأمر، شيك، عقد موثق...)", stage: "SUBMISSION" },
  { id: 3, label: "مراجعة الطلب والتحقق من استيفائه للمتطلبات النظامية", stage: "SUBMISSION" },
  { id: 4, label: "قيد طلب التنفيذ وإصدار رقم طلب التنفيذ الرسمي", stage: "SUBMISSION" },
  { id: 5, label: "إحالة الطلب إلى دائرة التنفيذ القضائية المختصة", stage: "SUBMISSION" },

  { id: 6, label: "إصدار قرار التنفيذ من قاضي التنفيذ (قرار 34)", stage: "NOTIFY" },
  { id: 7, label: "تبليغ المنفذ ضده بأمر التنفيذ رسمياً عبر وسائل الاتصال المعتمدة", stage: "NOTIFY" },
  { id: 8, label: "منح المنفذ ضده مهلة نظامية للتنفيذ أو الإفصاح عن أمواله", stage: "NOTIFY" },
  { id: 9, label: "التحقق من الاستجابة لأمر التنفيذ (السداد طوعاً أو الانتقال للتنفيذ الجبري)", stage: "NOTIFY" },

  { id: 10, label: "الإفصاح عن أموال المنفذ ضده من خلال الجهات الحكومية والمالية (قرار 46)", stage: "ENFORCE" },
  { id: 11, label: "الحجز على الحسابات البنكية والأرصدة المالية للمنفذ ضده", stage: "ENFORCE" },
  { id: 12, label: "الحجز على العقارات والمنقولات والأصول الأخرى التابعة للمدين", stage: "ENFORCE" },
  { id: 13, label: "الحجز على المستحقات المالية التابعة للمنفذ ضده لدى الغير", stage: "ENFORCE" },
  { id: 14, label: "إيقاف بعض الخدمات والإجراءات النظامية والمنع من السفر وفق الأنظمة", stage: "ENFORCE" },
  { id: 15, label: "تقييم الأموال المحجوزة وتحديد قيمتها السوقية عند الحاجة", stage: "ENFORCE" },
  { id: 16, label: "بيع الأموال المحجوزة إلكترونياً بالمزاد الإلكتروني المعتمد", stage: "ENFORCE" },
  { id: 17, label: "تحصيل المبالغ الناتجة عن التنفيذ والمحجوزات", stage: "ENFORCE" },
  { id: 18, label: "توزيع المبالغ المحصلة على طالب التنفيذ وفق السند التنفيذي", stage: "ENFORCE" },

  { id: 19, label: "إثبات الوفاء الكامل بالالتزام محل السند التنفيذي", stage: "FINISH" },
  { id: 20, label: "رفع كافة الحجوزات والإجراءات التنفيذية والمنع من السفر", stage: "FINISH" },
  { id: 21, label: "إصدار قرار إنهاء التنفيذ الرسمي من الدائرة القضائية", stage: "FINISH" },
  { id: 22, label: "إقفال ملف التنفيذ إلكترونيًا في منصة ناجز", stage: "FINISH" }
];

const enforcementScenariosList = [
  { id: "installment", label: "طلب مهلة أو تقسيط من المنفذ ضده" },
  { id: "objection", label: "الاعتراض على بعض إجراءات التنفيذ من قبل المنفذ ضده" },
  { id: "stay", label: "تعليق التنفيذ أو وقفه مؤقتًا بقرار قضائي" },
  { id: "settlement", label: "الصلح والتسوية بين الأطراف أثناء التنفيذ" },
  { id: "insolvency", label: "تعذر التنفيذ لعدم وجود أموال أو أصول قابلة للتنفيذ (الإعسار)" },
  { id: "milestones", label: "استكمال التنفيذ على دفعات متتالية حتى الوفاء الكامل" }
];

const litigationStepsList = [
  { id: 1, label: "تسجيل الدخول إلى منصة ناجز", stage: "SUBMIT" },
  { id: 2, label: "تقديم صحيفة الدعوى إلكترونيًا وإدخال بيانات الأطراف والطلبات وإرفاق المستندات", stage: "SUBMIT" },
  { id: 3, label: "مراجعة الدعوى من قبل المحكمة للتحقق من اكتمال البيانات والمتطلبات", stage: "SUBMIT" },
  { id: 4, label: "استكمال النواقص إن وجدت من قبل المدعي", stage: "SUBMIT" },
  { id: 5, label: "قيد الدعوى وإصدار رقم القضية", stage: "SUBMIT" },
  { id: 6, label: "إحالة القضية إلى الدائرة القضائية المختصة", stage: "SUBMIT" },
  { id: 7, label: "تحديد موعد الجلسة الأولى", stage: "SUBMIT" },
  { id: 8, label: "تبليغ أطراف الدعوى بموعد الجلسة وبيانات القضية", stage: "SUBMIT" },

  { id: 9, label: "تبادل المذكرات والمستندات بين الأطراف عبر ناجز قبل الجلسة أو أثناء سيرها", stage: "PLEADING" },
  { id: 10, label: "عقد الجلسات القضائية حضوريًا أو عن بُعد بحسب الإجراء المتبع", stage: "PLEADING" },
  { id: 11, label: "سماع أقوال الأطراف ودفوعهم وطلباتهم", stage: "PLEADING" },
  { id: 12, label: "تقديم الأدلة والإثباتات والمستندات المؤيدة للدعوى أو الدفاع", stage: "PLEADING" },
  { id: 13, label: "اتخاذ الإجراءات المساندة عند الحاجة (ندب خبير، سماع شهود، طلب معلومات)", stage: "PLEADING" },
  { id: 14, label: "إقفال باب المرافعة بعد اكتمال نظر القضية", stage: "PLEADING" },

  { id: 15, label: "إصدار الحكم الابتدائي", stage: "JUDGMENT" },
  { id: 16, label: "تبليغ الأطراف بالحكم", stage: "JUDGMENT" },
  { id: 17, label: "تقديم الاعتراض (الاستئناف) خلال المدة النظامية إذا رغب أحد الأطراف", stage: "JUDGMENT" },
  { id: 18, label: "نظر الاعتراض من قبل محكمة الاستئناف", stage: "JUDGMENT" },
  { id: 19, label: "إصدار حكم الاستئناف وتأييد الحكم أو تعديله أو نقضه", stage: "JUDGMENT" },
  { id: 20, label: "اكتساب الحكم الصفة النهائية (القطعية) عند انتهاء طرق الاعتراض", stage: "JUDGMENT" },

  { id: 21, label: "إصدار السند التنفيذي للحكم النهائي", stage: "EXECUTION" },
  { id: 22, label: "تقديم طلب التنفيذ عبر منصة ناجز", stage: "EXECUTION" },
  { id: 23, label: "تبليغ المنفذ ضده بأمر التنفيذ", stage: "EXECUTION" },
  { id: 24, label: "تنفيذ الحكم طوعًا أو اتخاذ إجراءات التنفيذ الجبري عند الامتناع", stage: "EXECUTION" },
  { id: 25, label: "إقفال ملف التنفيذ بعد استيفاء الحقوق أو انتهاء إجراءات التنفيذ", stage: "EXECUTION" }
];

const litigationScenariosList = [
  { id: "settlement", label: "الصلح بين الأطراف وإنهاء الدعوى" },
  { id: "dismissal", label: "شطب الدعوى لغياب المدعي وفقًا للحالات النظامية" },
  { id: "suspension", label: "وقف الدعوى مؤقتًا" },
  { id: "abandonment", label: "ترك الدعوى أو التنازل عنها" },
  { id: "jurisdiction", label: "عدم الاختصاص وإحالة القضية إلى جهة قضائية أخرى" },
  { id: "reopen", label: "إعادة فتح المرافعة إذا استجد ما يقتضي ذلك" }
];


const getStatusBadge = (status: string) => {
  switch (status) {
    case 'OPEN': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">مفتوحة</Badge>;
    case 'PENDING': return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-200">قيد الانتظار</Badge>;
    case 'JUDGEMENT_RESERVED': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">محجوزة للحكم</Badge>;
    case 'CLOSED': return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">مغلقة</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

/**
 * hook لخيار html2canvas: html2pdf.js يستنسخ العنصر المصدر ويُلحق النسخة
 * بـ document.body الرئيسي دائمًا (بصرف النظر عن مصدر العنصر)، فترث النسخة
 * تنسيقات Tailwind v4 العامة (*, ::before, ::after) التي تستخدم oklch() —
 * وhtml2canvas لا تدعم oklch() فتفشل. نزيل كل الأنماط من نسخة المستند التي
 * يبنيها html2canvas للرسم، ونعيد فقط خط Tajawal (محتوى التقرير كله inline
 * styles أصلًا، فلا حاجة لأي CSS آخر).
 */
async function stripUnsupportedColorsOnClone(clonedDoc: Document) {
  clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => el.remove());
  const fontLink = clonedDoc.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap";
  clonedDoc.head.appendChild(fontLink);
  try {
    await (clonedDoc as any).fonts?.ready;
  } catch {
    // خط بديل كافٍ إن تعذّر تحميل Tajawal — لا داعي لإفشال توليد PDF بسببه
  }
}

/** يحوّل رقم هاتف محلي (05xxxxxxxx أو بصيغة دولية) إلى صيغة wa.me بلا رموز أو مسافات */
function toWhatsAppNumber(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "966" + digits.slice(1);
  return digits;
}

export default function CaseDetails() {
  const { id } = useParams();
  const perms = usePermissions();
  const office = useOfficeSettings();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [memoBusyId, setMemoBusyId] = useState<string | null>(null);
  const [activeAiTarget, setActiveAiTarget] = useState<{ target: any, type: 'case' | 'document' | 'memo' } | null>(null);

  // New Memo State
  const [isWritingMemo, setIsWritingMemo] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [memoType, setMemoType] = useState("LAWSUIT");
  // معرّف المذكرة قيد التعديل — null يعني إنشاء مذكرة جديدة
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);

  const handleMemoTypeChange = (type: string, force = false, customData = data) => {
    setMemoType(type);
    if (!customData) return;
    
    // Auto-update title if it's empty or matches standard prefixes
    const prefixes = ["صحيفة دعوى", "مذكرة رد / دفاع", "مذكرة مرافعة"];
    const isStandardTitle = !memoTitle || memoTitle === "" || prefixes.some(p => memoTitle.startsWith(p));
    
    const newPrefix = type === "LAWSUIT" ? "صحيفة دعوى" : type === "MEMO" ? "مذكرة رد / دفاع" : "مذكرة مرافعة";
    if (isStandardTitle) {
      setMemoTitle(`${newPrefix} - ${customData.title || ""}`);
    }

    // Prepare template variables
    const dateStr = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const clientName = customData.client?.fullName || '..........';
    const lawyerName = customData.assignedLawyerName || customData.lawyerName || '..........';
    const courtName = customData.courtName || '..........';
    const opponentName = customData.opponentName || '..........';
    const courtCircle = customData.courtCircle || '..........';
    const caseSubject = customData.caseSubject || '<em>(يرجى كتابة موضوع الدعوى هنا...)</em>';
    const caseSummary = customData.summary || '<em>(يرجى كتابة وقائع الدعوى هنا...)</em>';

    let template = "";
    if (type === "LAWSUIT") {
      template = `<p style="text-align: center;"><strong>بسم الله الرحمن الرحيم</strong></p>
<p style="text-align: center; font-size: 16pt;"><strong>صحيفة دعوى</strong></p>
<p><strong>إنه في يوم:</strong> ${dateStr}</p>
<p><strong>بناءً على طلب السيد:</strong> ${clientName} <strong>ومحله المختار مكتب الأستاذ:</strong> ${lawyerName} المحامي.</p>
<p><strong>أنا محضر محكمة:</strong> ${courtName} قد انتقلت وأعلنت:</p>
<p><strong>السيد/</strong> ${opponentName} المقيم في: .......... مخاطباً مع/ ..........</p>
<hr />
<p><strong>الموضوع:</strong></p>
<p>بموجب هذه الصحيفة، يتقدم الطالب برفع هذه الدعوى ضد المعلن إليه، حيث أن:</p>
<p>${caseSubject}</p>
<p>وحيث أن الطالب قد طالب المعلن إليه ودياً بإنهاء النزاع دون جدوى، مما حدا به لإقامة هذه الدعوى القضائية.</p>
<p><strong>بناءً عليه:</strong></p>
<p>أنا المحضر سالف الذكر قد انتقلت في التاريخ أعلاه إلى حيث إقامة المعلن إليه وسلمته صورة من هذه الصحيفة وكلفته بالحضور أمام محكمة: <strong>${courtName}</strong> - الدائرة: <strong>${courtCircle}</strong> بجلستها المنعقدة يوم .......... الموافق .......... في تمام الساعة .......... لسماع الحكم بـ:</p>
<p><strong>الطلبات:</strong></p>
<ol>
  <li>..........</li>
  <li>إلزام المعلن إليه بالمصاريف وأتعاب المحاماة.</li>
</ol>
<p style="text-align: left;"><strong>ولأجل العلم،،،</strong></p>`;
    } else if (type === "MEMO") {
      template = `<p style="text-align: center;"><strong>بسم الله الرحمن الرحيم</strong></p>
<p style="text-align: center; font-size: 16pt;"><strong>مذكرة رد ودفاع</strong></p>
<p><strong>مقدمة إلى محكمة:</strong> ${courtName} - الدائرة: <strong>${courtCircle}</strong></p>
<p><strong>في القضية رقم:</strong> ${customData.caseNumber || '..........'} <strong>المحجوزة للحكم/المنظورة بجلسة:</strong> ..........</p>
<p><strong>من السيد:</strong> ${clientName} <em>(صفته: ${customData.plaintiffName === clientName ? 'مدعي' : 'مدعى عليه'})</em></p>
<p><strong>ضد السيد:</strong> ${opponentName} <em>(صفته: ${customData.plaintiffName === clientName ? 'مدعى عليه' : 'مدعي'})</em></p>
<hr />
<p><strong>الوقائع:</strong></p>
<p>نحيل بشأنها إلى ما ورد بأوراق الدعوى وصحيفة الافتتاحية، ونلخصها في الآتي:</p>
<p>${caseSummary}</p>
<p><strong>الدفاع والأسانيد القانونية:</strong></p>
<p>نؤسس دفاعنا على الآتي:</p>
<ol>
  <li><strong>أولاً:</strong> ..........</li>
  <li><strong>ثانياً:</strong> ..........</li>
</ol>
<p><strong>الطلبات:</strong></p>
<p>يلتمس مقدم المذكرة من عدالة المحكمة الموقرة الحكم بـ:</p>
<ol>
  <li>..........</li>
  <li>رفض الدعوى وإلزام رافعها بالمصروفات وأتعاب المحاماة.</li>
</ol>
<p style="text-align: left;"><strong>وكيل الطالب/ الأستاذ:</strong> ${lawyerName}</p>`;
    } else if (type === "PLEADING") {
      template = `<p style="text-align: center;"><strong>بسم الله الرحمن الرحيم</strong></p>
<p style="text-align: center; font-size: 16pt;"><strong>مذكرة مرافعة ختامية</strong></p>
<p><strong>أمام محكمة:</strong> ${courtName} - الدائرة: <strong>${courtCircle}</strong></p>
<p><strong>في الدعوى المقيدة برقم:</strong> ${customData.caseNumber || '..........'}</p>
<p><strong>مقدمة من الطالب:</strong> ${clientName}</p>
<p><strong>ضد المعلن إليه:</strong> ${opponentName}</p>
<hr />
<p><strong>الهيئة الموقرة:</strong></p>
<p>إن ما نطرحه بين أيديكم الكريمة في هذه المرافعة هو بيان للحق والعدل ودحض للمزاعم الموجهة ضد موكلنا، وذلك استناداً للحقائق التالية:</p>
<p>${caseSubject}</p>
<p><strong>خاتمة وطلبات ختامية:</strong></p>
<p>بناءً على ما تقدم من وقائع وأسانيد قانونية، نطلب من فضيلتكم الموقرة الحكم بـ:</p>
<ol>
  <li>..........</li>
  <li>إلزام المدعى عليه بالمصاريف القضائية.</li>
</ol>
<p style="text-align: left;"><strong>وتقبلوا فائق الاحترام والتقدير،،،</strong></p>
<p style="text-align: left;"><strong>مقدمه لفضيلتكم/</strong> ${lawyerName}</p>`;
    }

    if (force || !memoContent || memoContent === "" || memoContent.includes("بسم الله الرحمن الرحيم")) {
      setMemoContent(template);
    }
  };

  /** برومبت صياغة المسودة الكاملة حسب نوع المذكرة — تستخدمه لوحة الذكاء الاصطناعي */
  const buildMemoPrompt = (type: string, customData: any = data): string => {
    const clientName = customData.client?.fullName || '..........';
    const opponentName = customData.opponentName || '..........';
    const courtName = customData.courtName || '..........';
    const courtCircle = customData.courtCircle || '..........';
    const caseSubject = customData.caseSubject || 'نزاع قضائي';
    const caseSummary = customData.summary || 'نزاع قضائي بين الطرفين';

    let prompt = `أنت مستشار قانوني ومحامٍ خبير في الأنظمة واللوائح القضائية السعودية والعربية.
وظيفتك هي صياغة مسودة قانونية بأسلوب احترافي ورصين.
بيانات القضية الحالية:
- عنوان القضية: ${customData.title}
- رقم القضية: ${customData.caseNumber}
- المحكمة: ${courtName}
- الدائرة القضائية: ${courtCircle}
- المدعي: ${customData.plaintiffName || clientName}
- المدعى عليه: ${customData.defendantName || opponentName}
- موضوع القضية العام: ${caseSubject}
- ملخص القضية: ${caseSummary}`;

    if (type === "LAWSUIT") {
      prompt += `\nالمطلوب: صياغة "صحيفة دعوى" (مذكرة ادعاء) مفصلة واحترافية.
توجيهات الصياغة لصحيفة الدعوى:
1. ابدأ بالبسملة والتحية والتوجه إلى فضيلة رئيس وأعضاء الدائرة القضائية الموقرين.
2. اذكر أطراف الدعوى بوضوح (المدعي والمدعى عليه وصفاتهم).
3. اعرض الوقائع بشكل متسلسل ومنطقي بناءً على موضوع القضية وملخصها.
4. اذكر الأسانيد الشرعية والنظامية المناسبة للموضوع (حسب القوانين السارية).
5. لخص الطلبات النهائية للمدعي بوضوح ودقة (مثل إلزام المدعى عليه بدفع المبالغ المستحقة، إلخ).
6. اختم بعبارة "والله يحفظكم ويرعاكم، مقدمه لفضيلتكم..."
7. صِغ المذكرة بلغة عربية فصحى قانونية بليغة وبصيغة HTML منسقة (مثل استخدام فقرات <p>، وعناوين <h3>، وقوائم <ul> <li>، ونصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body>، فقط المحتوى الداخلي المنسق.`;
    } else if (type === "MEMO") {
      prompt += `\nالمطلوب: صياغة "مذكرة رد ودفاع" مفصلة واحترافية.
توجيهات الصياغة لمذكرة الرد:
1. ابدأ بالبسملة والتوجه إلى فضيلة رئيس وأعضاء الدائرة القضائية الموقرين.
2. اذكر أطراف الدعوى وعلاقتهم بموضوع الرد.
3. قم بالرد على وقائع الادعاء بأسلوب قانوني مفند ومقنع.
4. اذكر الدفوع القانونية والأدلة المستندة إلى ملخص القضية ووقائعها.
5. ادعم الدفوع بالأسانيد الشرعية والنظامية المناسبة.
6. حدد الطلبات الختامية بوضوح (مثل: رد الدعوى، إلزام المدعي بالتعويض أو المصاريف القضائية، إلخ).
7. اختم بعبارة مناسبة ومقدمه.
8. صِغ المذكرة بلغة عربية فصحى قانونية بليغة وبصيغة HTML منسقة (مثل استخدام فقرات <p>، وعناوين <h3>، وقوائم <ul> <li>، ونصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body>، فقط المحتوى الداخلي المنسق.`;
    } else {
      prompt += `\nالمطلوب: صياغة "مذكرة مرافعة ختامية" مفصلة واحترافية.
توجيهات الصياغة لمذكرة المرافعة:
1. ابدأ بالبسملة والتحية والتوجه للمحكمة الموقرة.
2. لخص أسباب المرافعة والأسانيد القانونية المؤيدة لموكلنا.
3. حدد الطلبات الختامية بوضوح.
4. صِغ المذكرة بلغة عربية فصحى قانونية بليغة وبصيغة HTML منسقة (مثل استخدام فقرات <p>، وعناوين <h3>، وقوائم <ul> <li>، ونصوص عريضة <strong>) بدون كود هيكلي كامل <html> أو <body>، فقط المحتوى الداخلي المنسق.`;
    }
    return prompt;
  };

  const MEMO_TYPE_LABELS: Record<string, string> = { LAWSUIT: "صحيفة دعوى", MEMO: "مذكرة رد / دفاع", PLEADING: "مذكرة مرافعة" };

  /** عنوان افتراضي حين يُدرج نص من المساعد والعنوان فارغ */
  const ensureMemoTitle = () => {
    if (!memoTitle.trim()) setMemoTitle(`${MEMO_TYPE_LABELS[memoType] || "مذكرة"} - ${data?.title || ""}`);
  };

  // New Case Modals & AI States
  const [isEditHearingOpen, setIsEditHearingOpen] = useState(false);
  const [selectedHearing, setSelectedHearing] = useState<any | null>(null);
  const [isAiMemoDrafterOpen, setIsAiMemoDrafterOpen] = useState(false);

  // Hearing Attachment States
  const [isHearingSelectOpen, setIsHearingSelectOpen] = useState(false);
  const [selectedMemoForHearing, setSelectedMemoForHearing] = useState<any | null>(null);
  const [isAdoptingMemoLoading, setIsAdoptingMemoLoading] = useState(false);

  const handleAdoptMemoToHearing = async (hearingId: string) => {
    if (!selectedMemoForHearing || !id) return;
    if (!memoActions(perms.role, statusOf(selectedMemoForHearing)).canFile) {
      alert("هذه المذكرة لم تكتمل دورة الاعتماد بعد — لا يمكن رفعها للجلسة قبل اعتمادها.");
      return;
    }
    setIsAdoptingMemoLoading(true);
    try {
      // 1. Ensure html2pdf is loaded
      if (!(window as any).html2pdf) {
        const script = window.document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        script.async = true;
        window.document.body.appendChild(script);
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = (err) => reject(err);
        });
      }

      // 2. Generate PDF Blob
      // الختم يُطبع لأن الوصول لهنا مشروط أصلاً بـ canFile (المذكرة معتمدة نهائياً)
      const element = document.createElement("div");
      element.innerHTML = `
        <div style="font-family: 'Tajawal', sans-serif; line-height: 1.8; direction: rtl; text-align: right; min-height: 100%; background:#fff;">
          ${renderLetterheadHeader(office.officeProfile)}
          <div style="padding: 30px 40px;">
            <h1 style="text-align: center; color: #133B2E; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; font-size: 22pt;">${selectedMemoForHearing.title}</h1>
            <div style="color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; font-size: 10pt;">
              قضية رقم: ${data.caseNumber || '---'} | تاريخ الاعتماد: ${new Date().toLocaleDateString('ar-EG')}
            </div>
            <div style="font-size: 14pt; text-align: justify;">${selectedMemoForHearing.content}</div>
          </div>
          ${renderLetterheadFooter(office.officeProfile, { stampUrl: office.officialStampUrl })}
        </div>
      `;
      document.body.appendChild(element);
      const opt = {
        margin:       15,
        filename:     `${selectedMemoForHearing.title}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, onclone: stripUnsupportedColorsOnClone },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const pdfBlob = await (window as any).html2pdf().from(element).set(opt).output('blob');
      document.body.removeChild(element);

      // 3. Upload PDF file
      // window.File وليس File — لأن File مستوردة كأيقونة من lucide-react وتحجب النوع الأصلي
      const fileOfBlob = new window.File([pdfBlob], `${selectedMemoForHearing.title}.pdf`, { type: 'application/pdf' });
      const fd = new FormData();
      fd.append("file", fileOfBlob);

      const response = await fetch("/upload.php", {
        method: "POST",
        body: fd,
      });

      if (!response.ok) {
        throw new Error("فشل رفع ملف PDF إلى الاستضافة");
      }

      const uploadResult = await response.json();
      if (uploadResult.error) {
        throw new Error(uploadResult.error);
      }

      const fileUrl = uploadResult.fileUrl;

      // 3.b توليد نسخة Word — مستند HTML بترويسة Word فتفتحه Microsoft Word مباشرة بلا مكتبات إضافية
      const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset="utf-8"><title>${selectedMemoForHearing.title}</title></head>
        <body dir="rtl" style="font-family: 'Traditional Arabic', 'Tajawal', sans-serif; padding: 0; line-height: 1.8; text-align: right;">
          ${renderLetterheadHeaderWordSafe(office.officeProfile)}
          <div style="padding: 40px;">
            <h1 style="text-align: center; color: #133B2E; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; font-size: 22pt;">${selectedMemoForHearing.title}</h1>
            <div style="color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; font-size: 10pt;">
              قضية رقم: ${data.caseNumber || '---'} | تاريخ الاعتماد: ${new Date().toLocaleDateString('ar-EG')}
            </div>
            <div style="font-size: 14pt; text-align: justify;">${selectedMemoForHearing.content}</div>
            ${renderLetterheadFooterWordSafe(office.officeProfile, { stampUrl: office.officialStampUrl })}
          </div>
        </body>
      </html>`;
      const wordBlob = new Blob(['﻿', wordHtml], { type: 'application/msword' });
      const wordFileOfBlob = new window.File([wordBlob], `${selectedMemoForHearing.title}.doc`, { type: 'application/msword' });
      const wordFd = new FormData();
      wordFd.append("file", wordFileOfBlob);

      const wordResponse = await fetch("/upload.php", { method: "POST", body: wordFd });
      if (!wordResponse.ok) throw new Error("فشل رفع ملف Word إلى الاستضافة");
      const wordUploadResult = await wordResponse.json();
      if (wordUploadResult.error) throw new Error(wordUploadResult.error);
      const wordFileUrl = wordUploadResult.fileUrl;

      // 4. Update the hearing document in Firestore
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");

      const hearingRef = doc(db, "cases", id, "hearings", hearingId);
      await updateDoc(hearingRef, {
        memoFileUrl: fileUrl,
        memoFileName: `${selectedMemoForHearing.title}.pdf`,
        memoWordFileUrl: wordFileUrl,
        memoWordFileName: `${selectedMemoForHearing.title}.doc`,
        updatedAt: new Date().toISOString()
      });

      // 4.b تعليم المذكرة نفسها كمرفوعة للجلسة — تمنع رفعها مجدداً بلا سبب
      await updateDoc(doc(db, "cases", id, "memos", selectedMemoForHearing.id), {
        status: "FILED",
        filedBy: { uid: perms.userId ?? "", name: localStorage.getItem("userName") ?? "", at: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      });
      await writeAudit({
        action: "UPDATE", entity: "memo", entityId: selectedMemoForHearing.id,
        entityLabel: selectedMemoForHearing.title,
        after: { الحالة: MEMO_STATUS_LABELS_AR.FILED },
      });

      // 5. Reload case details
      alert("تم اعتماد المذكرة بنجاح وتحويلها لصيغتي PDF وWord وإرفاقها بالجلسة المحددة!");
      setSelectedMemoForHearing(null);
      fetchCaseData();
    } catch (err: any) {
      console.error("Adoption error:", err);
      alert("حدث خطأ أثناء اعتماد المذكرة: " + err.message);
    } finally {
      setIsAdoptingMemoLoading(false);
    }
  };

  // Najiz integration states
  // ?tab= يسمح بفتح تبويب محدد مباشرة (مثال: قائمة قضايا التنفيذ تفتح على تبويب "تنفيذ الأحكام")
  const [searchParams] = useSearchParams();
  // تبويب "تنفيذ الأحكام" أُزيل — الروابط القديمة إليه تفتح التبويب الأول
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && tab !== "enforcement" ? tab : "info";
  });
  // الجهة المرسَل إليها تقرير حالة القضية — تُغيّر عنوان التقرير فقط
  const [reportAudience, setReportAudience] = useState<"CLIENT" | "OFFICE">("OFFICE");
  const [isGeneratingReportPdf, setIsGeneratingReportPdf] = useState(false);
  const [isSendingReportWhatsApp, setIsSendingReportWhatsApp] = useState(false);
  const [isSyncingNajiz, setIsSyncingNajiz] = useState(false);
  const [najizSyncSuccess, setNajizSyncSuccess] = useState(false);
  const [importFileLoading, setImportFileLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // Enforcement Steps State
  const [expandedStages, setExpandedStages] = useState<any>({
    SUBMISSION: true,
    NOTIFY: true,
    ENFORCE: false,
    FINISH: false,
    SUBMIT: true,
    PLEADING: true,
    JUDGMENT: false,
    EXECUTION: false,
  });

  const handleToggleEnforcementStep = async (stepId: number) => {
    if (!data) return;
    const currentSteps = data.enforcementSteps || {};
    const updatedSteps = {
      ...currentSteps,
      [stepId]: !currentSteps[stepId]
    };

    try {
      const caseRef = doc(db, "cases", data.id);
      await updateDoc(caseRef, { enforcementSteps: updatedSteps });
      setData((prev: any) => ({ ...prev, enforcementSteps: updatedSteps }));
    } catch (err) {
      console.error("Error updating enforcement step:", err);
      alert("حدث خطأ أثناء حفظ خطوة التنفيذ");
    }
  };

  const handleToggleEnforcementScenario = async (scenarioId: string) => {
    if (!data) return;
    const currentScenarios = data.enforcementScenarios || {};
    const updatedScenarios = {
      ...currentScenarios,
      [scenarioId]: !currentScenarios[scenarioId]
    };

    try {
      const caseRef = doc(db, "cases", data.id);
      await updateDoc(caseRef, { enforcementScenarios: updatedScenarios });
      setData((prev: any) => ({ ...prev, enforcementScenarios: updatedScenarios }));
    } catch (err) {
      console.error("Error updating enforcement scenario:", err);
      alert("حدث خطأ أثناء حفظ حالة التنفيذ");
    }
  };

  const completedStepsCount = data?.enforcementSteps
    ? Object.values(data.enforcementSteps).filter(Boolean).length
    : 0;
  const enforcementProgress = Math.round((completedStepsCount / 22) * 100);

  // حفظ حقول تنفيذ الحكم المفردة (الآيبان، نوع التنفيذ الاختياري، سبب الإنهاء، مهلة التبليغ)
  const handleUpdateEnforcementField = async (field: string, value: unknown) => {
    if (!data) return;
    try {
      const caseRef = doc(db, "cases", data.id);
      await updateDoc(caseRef, { [field]: value });
      setData((prev: any) => ({ ...prev, [field]: value }));
    } catch (err) {
      console.error(`Error updating ${field}:`, err);
      alert("حدث خطأ أثناء الحفظ");
    }
  };

  // أطراف الدعوى — ونُحدّث plaintiffName/defendantName لأن المذكرات والجلسات تقرأ منها
  const handleSaveParties = async (parties: CaseParty[]) => {
    if (!data) return;
    const namesOf = (role: CaseParty["role"]) => parties.filter((p) => p.role === role).map((p) => p.name).join("، ");
    const patch = {
      parties,
      plaintiffName: namesOf("PLAINTIFF"),
      defendantName: namesOf("DEFENDANT"),
      updatedAt: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, "cases", data.id), patch);
      setData((prev: any) => ({ ...prev, ...patch }));
    } catch (err) {
      console.error("Error saving case parties:", err);
      alert("حدث خطأ أثناء حفظ أطراف الدعوى");
    }
  };

  // الأحكام — ونُزامن finalJudgment (آخر حكم نهائي) لأن تبويب التنفيذ وتقرير الحالة يقرآن منه
  const handleSaveJudgments = async (judgments: CaseJudgment[]) => {
    if (!data) return;
    const final = legacyFinalJudgment(judgments);
    try {
      await updateDoc(doc(db, "cases", data.id), {
        judgments,
        finalJudgment: final ?? deleteField(),
        updatedAt: new Date().toISOString(),
      });
      setData((prev: any) => {
        const next = { ...prev, judgments };
        if (final) next.finalJudgment = final; else delete next.finalJudgment;
        return next;
      });
    } catch (err) {
      console.error("Error saving judgments:", err);
      alert("حدث خطأ أثناء حفظ الأحكام");
      throw err;
    }
  };

  // أسانيد الدعوى وطلباتها — نص ومرفقات في حقل واحد لكل قسم
  const handleSaveClaimSection = async (field: "claimGrounds" | "claimRequests", value: ClaimSectionValue) => {
    if (!data) return;
    try {
      await updateDoc(doc(db, "cases", data.id), { [field]: value, updatedAt: new Date().toISOString() });
      setData((prev: any) => ({ ...prev, [field]: value }));
    } catch (err) {
      console.error(`Error saving ${field}:`, err);
      throw err;
    }
  };

  const handleSaveDecisions = async (decisions: CaseDecision[]) => {
    if (!data) return;
    try {
      await updateDoc(doc(db, "cases", data.id), { decisions, updatedAt: new Date().toISOString() });
      setData((prev: any) => ({ ...prev, decisions }));
    } catch (err) {
      console.error("Error saving decisions:", err);
      alert("حدث خطأ أثناء حفظ القرارات");
      throw err;
    }
  };

  const handleToggleLitigationStep = async (stepId: number) => {
    if (!data) return;
    const currentSteps = data.litigationSteps || {};
    const updatedSteps = {
      ...currentSteps,
      [stepId]: !currentSteps[stepId]
    };

    try {
      const caseRef = doc(db, "cases", data.id);
      await updateDoc(caseRef, { litigationSteps: updatedSteps });
      setData((prev: any) => ({ ...prev, litigationSteps: updatedSteps }));
    } catch (err) {
      console.error("Error updating litigation step:", err);
      alert("حدث خطأ أثناء حفظ خطوة التقاضي");
    }
  };

  const handleToggleLitigationScenario = async (scenarioId: string) => {
    if (!data) return;
    const currentScenarios = data.litigationScenarios || {};
    const updatedScenarios = {
      ...currentScenarios,
      [scenarioId]: !currentScenarios[scenarioId]
    };

    try {
      const caseRef = doc(db, "cases", data.id);
      await updateDoc(caseRef, { litigationScenarios: updatedScenarios });
      setData((prev: any) => ({ ...prev, litigationScenarios: updatedScenarios }));
    } catch (err) {
      console.error("Error updating litigation scenario:", err);
      alert("حدث خطأ أثناء حفظ الحالة الخاصة");
    }
  };

  const completedLitigationStepsCount = data?.litigationSteps 
    ? Object.values(data.litigationSteps).filter(Boolean).length 
    : 0;
  const litigationProgress = Math.round((completedLitigationStepsCount / 25) * 100);

  const handleOfficialNajizSync = async () => {
    setIsSyncingNajiz(true);
    setNajizSyncSuccess(false);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setNajizSyncSuccess(true);
      setTimeout(() => setNajizSyncSuccess(false), 3000);
      fetchCaseData();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncingNajiz(false);
    }
  };

  const handleManualImportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileLoading(true);
    setImportSuccess(false);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 4000);
      fetchCaseData();
    } catch (err) {
      console.error(err);
    } finally {
      setImportFileLoading(false);
    }
  };

  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [isAddHearingOpen, setIsAddHearingOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isEditCaseOpen, setIsEditCaseOpen] = useState(false);

  const [viewDocument, setViewDocument] = useState<any>(null);

  const fetchCaseData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const caseDoc = await getDoc(doc(db, "cases", id));
      if (!caseDoc.exists()) {
        setData({ error: "القضية غير موجودة" });
        return;
      }
      const caseData = caseDoc.data();
      const currentLawyerId = localStorage.getItem("lawyerId");
      const userRole = localStorage.getItem("userRole");

      // SaaS Security Check: Ensure lawyer only sees their own case
      const currentUserId = localStorage.getItem("userId");
      if (
        userRole !== "SUPER_ADMIN" && 
        (caseData.lawyerId !== currentLawyerId || (userRole === "OFFICE_LAWYER" && caseData.assignedLawyerId !== currentUserId))
      ) {
          setData({ error: "غير مصرح لك بالدخول لهذه القضية" });
          return;
      }
      
      // Fetch related client
      const clientDoc = await getDoc(doc(db, "clients", caseData.clientId));
      const clientData = clientDoc.exists() ? clientDoc.data() : { fullName: "غير معروف" };

      // Fetch hearings
      const hearingsSnap = await getDocs(collection(doc(db, "cases", id), "hearings"));
      const hearings = hearingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch documents
      const docsSnap = await getDocs(collection(doc(db, "cases", id), "documents"));
      const documents = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch tasks
      const tasksSnap = await getDocs(query(collection(db, "tasks"), where("caseId", "==", id)));
      const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch memos
      const memosSnap = await getDocs(collection(doc(db, "cases", id), "memos"));
      const memos = memosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch requests (الطلبات)
      const requestsSnap = await getDocs(collection(doc(db, "cases", id), "requests"));
      const requests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch client documents (shared across all cases of this client)
      let clientDocuments: any[] = [];
      if (caseData.clientId) {
        try {
          const clientDocsSnap = await getDocs(
            collection(doc(db, "clients", caseData.clientId), "documents")
          );
          clientDocuments = clientDocsSnap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            source: "client",
          }));
        } catch (e) {
          console.error("Could not fetch client documents:", e);
        }
      }

      setData({
        id: caseDoc.id,
        ...caseData,
        client: clientData,
        hearings,
        documents,
        clientDocuments,
        tasks,
        memos,
        requests
      });
    } catch (error) {
      console.error("Error fetching case data:", error);
      setData({ error: "حدث خطأ أثناء تحميل البيانات" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseData();
  }, [id]);

  const handleSaveMemo = async () => {
    if (!memoTitle || !memoContent || !id) return;
    try {
      if (editingMemoId) {
        // تعديل مذكرة قائمة: أي تغيير في المحتوى يعيدها لمسودة ويمسح أثر المراجعة/الاعتماد السابق
        await updateDoc(doc(db, "cases", id, "memos", editingMemoId), {
          title: memoTitle,
          content: memoContent,
          type: memoType,
          status: "DRAFT" as MemoStatus,
          reviewedBy: deleteField(),
          approvedBy: deleteField(),
          rejectionReason: deleteField(),
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(doc(db, "cases", id), "memos"), {
          title: memoTitle,
          content: memoContent,
          type: memoType,
          status: "DRAFT" as MemoStatus,
          sharedWithClient: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: perms.userId ?? null,
          createdByName: localStorage.getItem("userName") ?? null,
        });
      }
      setIsWritingMemo(false);
      setEditingMemoId(null);
      setMemoTitle("");
      setMemoContent("");
      fetchCaseData();
    } catch(err) {
      console.error(err);
    }
  };

  /** ينقل المذكرة لحالة جديدة في دورة الاعتماد بعد التحقق من آلة الحالات ومن صلاحية الدور */
  const moveMemo = async (memo: any, to: MemoStatus, extra: Record<string, unknown> = {}) => {
    setMemoBusyId(memo.id);
    try {
      const me = { uid: perms.userId ?? "", name: localStorage.getItem("userName") ?? "", at: new Date().toISOString() };
      const patch: Record<string, unknown> = { status: to, updatedAt: me.at, ...extra };
      if (to === "PENDING_APPROVAL" && statusOf(memo) === "UNDER_REVIEW") patch.reviewedBy = me;
      if (to === "APPROVED") patch.approvedBy = me;

      await updateDoc(doc(db, "cases", id!, "memos", memo.id), patch);
      await writeAudit({
        action: to === "APPROVED" ? "APPROVE" : to === "REJECTED" ? "REJECT" : "UPDATE",
        entity: "memo", entityId: memo.id,
        entityLabel: memo.title,
        before: { الحالة: MEMO_STATUS_LABELS_AR[statusOf(memo)] },
        after: { الحالة: MEMO_STATUS_LABELS_AR[to] },
      });
      await fetchCaseData();
    } catch (err) {
      console.error(err);
      alert("تعذّر تحديث حالة المذكرة.");
    } finally {
      setMemoBusyId(null);
    }
  };

  const handleRejectMemo = async (memo: any) => {
    const reason = prompt("سبب الرفض (يُسجَّل في سجل التدقيق):");
    if (reason === null) return;
    await moveMemo(memo, "REJECTED", { rejectionReason: reason || null });
  };

  const toggleShareMemo = async (memo: any) => {
    setMemoBusyId(memo.id);
    try {
      await updateDoc(doc(db, "cases", id!, "memos", memo.id), {
        sharedWithClient: !memo.sharedWithClient,
        updatedAt: new Date().toISOString(),
      });
      await writeAudit({
        action: "UPDATE", entity: "memo", entityId: memo.id,
        entityLabel: memo.title,
        after: { "مشاركة مع العميل": !memo.sharedWithClient ? "مفعّلة" : "ملغاة" },
      });
      await fetchCaseData();
    } catch (err) {
      console.error(err);
      alert("تعذّر تغيير المشاركة.");
    } finally {
      setMemoBusyId(null);
    }
  };

  if (loading) return <div className="text-center py-20">جاري تحميل تفاصيل القضية...</div>;
  if (!data || data.error) return <div className="text-center py-20 text-red-500">{data?.error || "حدث خطأ أو لم يتم العثور على القضية"}</div>;

  const isExecutionCase = data.type === "تنفيذ" || data.type === "ENFORCEMENT";

  return (
    <div className="space-y-6">
      <DocumentViewerModal
        isOpen={!!viewDocument}
        onClose={() => setViewDocument(null)}
        document={viewDocument}
      />

      <HearingSelectModal 
        isOpen={isHearingSelectOpen}
        onClose={() => {
          setIsHearingSelectOpen(false);
          setSelectedMemoForHearing(null);
        }}
        hearings={data?.hearings || []}
        onConfirm={handleAdoptMemoToHearing}
        loading={isAdoptingMemoLoading}
      />

      <AddDocumentModal 
        isOpen={isAddDocOpen} 
        onClose={() => setIsAddDocOpen(false)} 
        onSuccess={fetchCaseData} 
        caseId={id!} 
        clientId={data?.clientId}
      />
      <AddHearingModal 
        isOpen={isAddHearingOpen} 
        onClose={() => setIsAddHearingOpen(false)} 
        onSuccess={fetchCaseData} 
        caseId={id!} 
        initialCaseData={data}
      />
      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => setIsAddTaskOpen(false)}
        onSuccess={fetchCaseData}
        caseId={id!}
        clientId={data?.clientId}
      />
      <EditCaseModal
        isOpen={isEditCaseOpen}
        onClose={() => setIsEditCaseOpen(false)}
        onSuccess={fetchCaseData}
        caseData={data}
      />

      {isEditHearingOpen && selectedHearing && (
        <EditHearingModal
          isOpen={isEditHearingOpen}
          onClose={() => {
            setIsEditHearingOpen(false);
            setSelectedHearing(null);
          }}
          onSuccess={fetchCaseData}
          caseId={id!}
          hearingData={selectedHearing}
        />
      )}

      {isAiMemoDrafterOpen && (
        <AiMemoDrafterModal
          isOpen={isAiMemoDrafterOpen}
          onClose={() => setIsAiMemoDrafterOpen(false)}
          caseData={data}
          onDraftCompleted={(title, type, content) => {
            setEditingMemoId(null);
            setMemoTitle(title);
            setMemoType(type);
            setMemoContent(content);
            setIsWritingMemo(true);
          }}
        />
      )}

      {activeAiTarget && (
        <AiSummarizerModal 
          isOpen={!!activeAiTarget} 
          onClose={() => setActiveAiTarget(null)} 
          target={activeAiTarget.target} 
          type={activeAiTarget.type} 
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link to="/app/cases" className="text-gray-500 hover:text-[#133B2E] inline-flex items-center text-sm font-medium transition-colors">
          <ChevronRight size={16} className="ml-1" />
          العودة للقضايا
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">{data.title}</h1>
              {getStatusBadge(data.status)}
            </div>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">رقم القضية: {data.caseNumber}</span>
              <span>•</span>
              <span>المحكمة: {data.courtName || "غير محدد"}</span>
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => window.print()}>
              <Download className="ml-2 h-4 w-4" /> طباعة ملف القضية
            </Button>
            <Button variant="outline" className="text-purple-600 border-purple-200 hover:bg-purple-50" onClick={() => setActiveAiTarget({ target: data, type: 'case' })}>
              <Sparkles className="ml-2 h-4 w-4" /> تلخيص شامل للذكاء الاصطناعي
            </Button>
            <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white" onClick={() => setIsEditCaseOpen(true)}>
              <Edit className="ml-2 h-4 w-4" /> تعديل بيانات القضية
            </Button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          .print-hidden { display: none !important; }
          .no-print { display: none !important; }
        }
      `}} />

      <div className="print-content">

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as string)} className="w-full">
        <div 
          style={{ position: "sticky", top: 0, zIndex: 20 }} 
          className="bg-[#F3F4F6]/95 backdrop-blur-md py-3 -mx-4 px-4 mb-6 border-b border-gray-200/50"
        >
          <TabsList className={`grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2 border-none p-0 w-full h-auto bg-transparent`}>
            <TabsTrigger 
              value="info" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "info"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "info" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>التفاصيل العامة</span>
                <span className={`text-sm leading-tight font-bold block ${activeTab === "info" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>موضوع الدعوى</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "info" ? "!bg-white/20 !text-amber-300" : "bg-indigo-100/70 text-indigo-600"}`}>
                <Scale size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="parties" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "parties"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "parties" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>أطراف الدعوى</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "parties" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{partiesOf(data).length}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "parties" ? "!bg-white/20 !text-amber-300" : "bg-emerald-100/70 text-emerald-600"}`}>
                <UsersRound size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="memos" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "memos"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "memos" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>المذكرات والصحف</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "memos" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{data.memos?.length || 0}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "memos" ? "!bg-white/20 !text-amber-300" : "bg-amber-100/70 text-amber-600"}`}>
                <FileSignature size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="hearings" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "hearings"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "hearings" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>جلسات القضية</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "hearings" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{data.hearings.length}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "hearings" ? "!bg-white/20 !text-amber-300" : "bg-cyan-100/70 text-cyan-600"}`}>
                <Calendar size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="requests" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "requests"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "requests" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>الطلبات</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "requests" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{data.requests?.length || 0}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "requests" ? "!bg-white/20 !text-amber-300" : "bg-lime-100/70 text-lime-700"}`}>
                <Archive size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="decisions" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "decisions"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "decisions" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>القرارات</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "decisions" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{decisionsOf(data).length}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "decisions" ? "!bg-white/20 !text-amber-300" : "bg-indigo-100/70 text-indigo-600"}`}>
                <ScrollText size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="judgment" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "judgment"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "judgment" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>الأحكام</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "judgment" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{judgmentsOf(data).length}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "judgment" ? "!bg-white/20 !text-amber-300" : "bg-emerald-100/70 text-emerald-600"}`}>
                <Gavel size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger 
              value="docs" 
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "docs"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "docs" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>المستندات</span>
                <span className={`text-lg leading-tight font-bold block ${activeTab === "docs" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>{data.documents.length}</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "docs" ? "!bg-white/20 !text-amber-300" : "bg-rose-100/70 text-rose-600"}`}>
                <FileText size={16} />
              </div>
            </TabsTrigger>

            <TabsTrigger
              value="reports"
              className={`transition-all rounded-xl px-3 py-2 cursor-pointer text-right w-full flex items-center justify-between gap-2 min-w-0 ${
                activeTab === "reports"
                  ? "!bg-[#133B2E] !text-white shadow-md shadow-[#133B2E]/25 border border-[#133B2E]"
                  : "bg-white text-[#133B2E] border border-slate-200/80 shadow-xs hover:shadow-md"
              }`}
            >
              <div className="min-w-0">
                <span className={`text-[11px] font-semibold block mb-0.5 truncate ${activeTab === "reports" ? "!text-amber-300 font-bold" : "text-slate-400"}`}>التقارير</span>
                <span className={`text-sm leading-tight font-bold block truncate ${activeTab === "reports" ? "!text-white font-extrabold" : "text-[#133B2E]"}`}>تقرير الحالة</span>
              </div>
              <div className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 ${activeTab === "reports" ? "!bg-white/20 !text-amber-300" : "bg-teal-100/70 text-teal-700"}`}>
                <FileBarChart size={16} />
              </div>
            </TabsTrigger>

          </TabsList>
        </div>

        <TabsContent value="info" className="mt-8 outline-none space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">بيانات القضية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">نوع القضية</span>
                    <span className="font-medium">
                      {({ CIVIL: "مدني", COMMERCIAL: "تجاري", CRIMINAL: "جزائي", LABOR: "عمالي", EXECUTION: "تنفيذ", ENFORCEMENT: "تنفيذ" } as Record<string, string>)[data.type] || data.type || "غير محدد"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">الصفة</span>
                    <span className="font-medium text-[#133B2E]">
                      {CLIENT_ROLE_LABELS_AR[clientRoleOf(data)]}
                    </span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">المحكمة المرفوع أمامها</span>
                    <span className="font-medium text-[#133B2E]">{data.courtName || "غير محدد"}</span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">الدائرة القضائية</span>
                    <span className="font-medium text-[#133B2E]">{data.courtCircle || "غير محدد"}</span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">تاريخ البداية</span>
                    <span className="font-medium" dir="ltr">{data.startDate ? new Date(data.startDate).toLocaleDateString('ar-EG') : "-"}</span>
                  </div>
                  {/* نفس الحقول التي يحفظها نموذج تعديل القضية — فيظهر أي تعديل فور الحفظ */}
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">المحامي المسؤول</span>
                    <span className="font-medium">{data.assignedLawyerName || "غير محدد"}</span>
                  </div>
                  <div className="flex justify-between border-b pb-3 border-gray-100">
                    <span className="text-gray-500">المستشار</span>
                    <span className="font-medium">{data.assignedConsultantName || "بلا مستشار"}</span>
                  </div>
                  <div className="flex justify-between gap-4 pb-1">
                    <span className="text-gray-500 shrink-0">المتدربون</span>
                    <span className="font-medium text-left">{data.traineeNames?.length ? data.traineeNames.join("، ") : "لا يوجد"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">موضوع الدعوى القضائية</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 p-4 rounded-lg border border-gray-100 font-medium">
                  {data.caseSubject || "لم يتم تحديد موضوع تفصيلي للدعوى بعد."}
                </p>
              </CardContent>
            </Card>

            <CaseClaimSection
              title="أسانيد الدعوى"
              placeholder="اكتب الأسانيد النظامية والوقائع والأدلة التي تستند إليها الدعوى..."
              emptyText="لم تُضف أسانيد للدعوى بعد."
              value={claimSectionOf(data.claimGrounds)}
              onSave={(v) => handleSaveClaimSection("claimGrounds", v)}
            />

            <CaseClaimSection
              title="طلبات الدعوى"
              placeholder="اكتب الطلبات الختامية في الدعوى..."
              emptyText="لم تُضف طلبات للدعوى بعد."
              value={claimSectionOf(data.claimRequests)}
              onSave={(v) => handleSaveClaimSection("claimRequests", v)}
            />

            {/* Najiz Litigation Steps Tracker Card */}
            {(data.type !== "تنفيذ" && data.type !== "ENFORCEMENT") && (
              <Card className="shadow-sm md:col-span-2 border border-blue-200/60 overflow-hidden bg-white">
                <CardHeader className="pb-4 bg-blue-50/20 border-b border-blue-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <CardTitle className="text-lg text-[#133B2E] flex items-center gap-2">
                      <Scale className="text-blue-600 w-5 h-5" /> مسار سير إجراءات التقاضي في نظام ناجز
                    </CardTitle>
                    <CardDescription className="text-gray-500 text-xs">
                      تتبع الخطوات القضائية الـ 25 الرسمية للدعوى في المحاكم التجارية والمدنية والعمالية حسب منصة ناجز
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1 w-full md:w-auto">
                    <span className="text-xs font-bold text-blue-900 bg-blue-100 px-3 py-1 rounded-full">
                      مكتمل: {completedLitigationStepsCount} من 25 ({litigationProgress}%)
                    </span>
                  </div>
                </CardHeader>
                
                <CardContent className="p-6 space-y-6">
                  {/* Global Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${litigationProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* Litigation Stages */}
                  <div className="space-y-4">
                    {/* Stage 1: Submission */}
                    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs">
                      <button 
                        onClick={() => setExpandedStages((prev: any) => ({ ...prev, SUBMIT: !prev.SUBMIT }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100/70 transition text-right"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#133B2E] text-sm">1. تقديم قيد الدعوى وإحالتها</span>
                          <span className="text-xs text-gray-500 font-medium">({litigationStepsList.filter(s => s.stage === "SUBMIT").filter(s => data.litigationSteps?.[s.id]).length}/8)</span>
                        </div>
                        {expandedStages.SUBMIT ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                      
                      {expandedStages.SUBMIT && (
                        <div className="p-3 bg-white divide-y divide-gray-50">
                          {litigationStepsList.filter(s => s.stage === "SUBMIT").map(step => (
                            <div 
                              key={step.id} 
                              onClick={() => handleToggleLitigationStep(step.id)}
                              className="flex items-start gap-3 py-2.5 px-2 hover:bg-blue-50/20 cursor-pointer rounded-lg transition"
                            >
                              <div className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition ${data.litigationSteps?.[step.id] ? "bg-blue-600 border-blue-700 text-white" : "border-gray-300 bg-white"}`}>
                                {data.litigationSteps?.[step.id] && <span className="text-[10px] font-bold">✓</span>}
                              </div>
                              <span className={`text-xs leading-relaxed ${data.litigationSteps?.[step.id] ? "text-gray-500 line-through" : "text-gray-800 font-medium"}`}>
                                <span className="font-bold text-gray-400 ml-1">{step.id}.</span> {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stage 2: Pleadings & Hearings */}
                    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs">
                      <button 
                        onClick={() => setExpandedStages((prev: any) => ({ ...prev, PLEADING: !prev.PLEADING }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100/70 transition text-right"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#133B2E] text-sm">2. الترافع وتبادل المذكرات والجلسات</span>
                          <span className="text-xs text-gray-500 font-medium">({litigationStepsList.filter(s => s.stage === "PLEADING").filter(s => data.litigationSteps?.[s.id]).length}/6)</span>
                        </div>
                        {expandedStages.PLEADING ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                      
                      {expandedStages.PLEADING && (
                        <div className="p-3 bg-white divide-y divide-gray-50">
                          {litigationStepsList.filter(s => s.stage === "PLEADING").map(step => (
                            <div 
                              key={step.id} 
                              onClick={() => handleToggleLitigationStep(step.id)}
                              className="flex items-start gap-3 py-2.5 px-2 hover:bg-blue-50/20 cursor-pointer rounded-lg transition"
                            >
                              <div className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition ${data.litigationSteps?.[step.id] ? "bg-blue-600 border-blue-700 text-white" : "border-gray-300 bg-white"}`}>
                                {data.litigationSteps?.[step.id] && <span className="text-[10px] font-bold">✓</span>}
                              </div>
                              <span className={`text-xs leading-relaxed ${data.litigationSteps?.[step.id] ? "text-gray-500 line-through" : "text-gray-800 font-medium"}`}>
                                <span className="font-bold text-gray-400 ml-1">{step.id}.</span> {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stage 3: Judgments */}
                    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs">
                      <button 
                        onClick={() => setExpandedStages((prev: any) => ({ ...prev, JUDGMENT: !prev.JUDGMENT }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100/70 transition text-right"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#133B2E] text-sm">3. الأحكام والاعتراض والاستئناف</span>
                          <span className="text-xs text-gray-500 font-medium">({litigationStepsList.filter(s => s.stage === "JUDGMENT").filter(s => data.litigationSteps?.[s.id]).length}/6)</span>
                        </div>
                        {expandedStages.JUDGMENT ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                      
                      {expandedStages.JUDGMENT && (
                        <div className="p-3 bg-white divide-y divide-gray-50">
                          {litigationStepsList.filter(s => s.stage === "JUDGMENT").map(step => (
                            <div 
                              key={step.id} 
                              onClick={() => handleToggleLitigationStep(step.id)}
                              className="flex items-start gap-3 py-2.5 px-2 hover:bg-blue-50/20 cursor-pointer rounded-lg transition"
                            >
                              <div className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition ${data.litigationSteps?.[step.id] ? "bg-blue-600 border-blue-700 text-white" : "border-gray-300 bg-white"}`}>
                                {data.litigationSteps?.[step.id] && <span className="text-[10px] font-bold">✓</span>}
                              </div>
                              <span className={`text-xs leading-relaxed ${data.litigationSteps?.[step.id] ? "text-gray-500 line-through" : "text-gray-800 font-medium"}`}>
                                <span className="font-bold text-gray-400 ml-1">{step.id}.</span> {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stage 4: Execution */}
                    <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs">
                      <button 
                        onClick={() => setExpandedStages((prev: any) => ({ ...prev, EXECUTION: !prev.EXECUTION }))}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100/70 transition text-right"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#133B2E] text-sm">4. السند والتنفيذ والتحصيل</span>
                          <span className="text-xs text-gray-500 font-medium">({litigationStepsList.filter(s => s.stage === "EXECUTION").filter(s => data.litigationSteps?.[s.id]).length}/5)</span>
                        </div>
                        {expandedStages.EXECUTION ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                      
                      {expandedStages.EXECUTION && (
                        <div className="p-3 bg-white divide-y divide-gray-50">
                          {litigationStepsList.filter(s => s.stage === "EXECUTION").map(step => (
                            <div 
                              key={step.id} 
                              onClick={() => handleToggleLitigationStep(step.id)}
                              className="flex items-start gap-3 py-2.5 px-2 hover:bg-blue-50/20 cursor-pointer rounded-lg transition"
                            >
                              <div className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition ${data.litigationSteps?.[step.id] ? "bg-blue-600 border-blue-700 text-white" : "border-gray-300 bg-white"}`}>
                                {data.litigationSteps?.[step.id] && <span className="text-[10px] font-bold">✓</span>}
                              </div>
                              <span className={`text-xs leading-relaxed ${data.litigationSteps?.[step.id] ? "text-gray-500 line-through" : "text-gray-800 font-medium"}`}>
                                <span className="font-bold text-gray-400 ml-1">{step.id}.</span> {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Special Scenarios Section */}
                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    <h4 className="text-sm font-bold text-[#133B2E] flex items-center gap-2">
                      <AlertTriangle className="text-blue-500 w-4 h-4" /> حالات طارئة قد تطرأ أثناء سير القضية
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-blue-50/10 p-4 rounded-xl border border-blue-100/50">
                      {litigationScenariosList.map(item => (
                        <label 
                          key={item.id} 
                          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition select-none ${data.litigationScenarios?.[item.id] ? "bg-blue-100/30 text-[#133B2E] font-bold" : "hover:bg-gray-50 text-gray-600"}`}
                        >
                          <input 
                            type="checkbox"
                            checked={!!data.litigationScenarios?.[item.id]}
                            onChange={() => handleToggleLitigationScenario(item.id)}
                            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs leading-relaxed">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="parties" className="mt-8 outline-none space-y-6">
          <CaseParties caseData={data} onSave={handleSaveParties} />
        </TabsContent>

        <TabsContent value="requests" className="mt-8 outline-none space-y-6">
          <CaseRequests caseId={id!} caseData={data} requests={data.requests || []} onChanged={fetchCaseData} />
        </TabsContent>

        <TabsContent value="hearings" className="mt-8 outline-none space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
              <div>
                <CardTitle className="text-lg">سجل الجلسات</CardTitle>
                <CardDescription>الترتيب من الأقدم للأحدث</CardDescription>
              </div>
              <Button size="sm" className="bg-[#133B2E] hover:bg-[#133B2E]/90" onClick={() => setIsAddHearingOpen(true)}>
                <Plus className="ml-2 h-4 w-4" /> اضافة جلسة جديدة
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {data.hearings.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا يوجد جلسات مسجلة</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.hearings.map((h: any) => (
                    <HearingCard
                      key={h.id}
                      h={h}
                      caseId={id!}
                      showCase={false}
                      actions={
                        <button
                          onClick={() => { setSelectedHearing(h); setIsEditHearingOpen(true); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-sm font-bold text-[#133B2E] hover:bg-gray-50 transition"
                        >
                          <Edit className="h-3.5 w-3.5" /> تعديل
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memos" className="mt-8 outline-none space-y-6">
          {!isWritingMemo ? (
            <div className="space-y-4">
              {perms.canCreate("memo.manage") && (
                <div className="flex justify-end">
                  <Button onClick={() => {
                    setEditingMemoId(null);
                    setIsWritingMemo(true);
                    // صفحة بيضاء — التعبئة والصياغة من لوحة المساعد الذكي
                    setMemoType("LAWSUIT");
                    setMemoTitle("");
                    setMemoContent("");
                  }} className="bg-[#D4AF37] hover:bg-[#B8962E] text-white">
                    <FileSignature className="ml-2 h-4 w-4" /> كتابة مذكرة / صحيفة جديدة
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(data.memos || []).length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                    لا يوجد مذكرات مسجلة لهذه القضية بعد. يمكنك كتابة صحيفة الدعوى أو مذكرة المرافعة وتنسيقها هنا.
                  </div>
                ) : (
                  data.memos.map((memo: any) => {
                    const memoStatus = statusOf(memo);
                    const a = memoActions(perms.role, memoStatus);
                    const memoBusy = memoBusyId === memo.id;
                    return (
                    <Card key={memo.id} className="shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                      <CardHeader className="pb-3 border-b border-gray-100">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg text-[#133B2E] line-clamp-1" title={memo.title}>{memo.title}</CardTitle>
                          <Badge variant="outline" className="bg-gray-50 text-[10px]">{memo.type === 'LAWSUIT' ? 'صحيفة دعوى' : memo.type === 'PLEADING' ? 'مرافعة' : 'مذكرة'}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${MEMO_STATUS_COLORS[memoStatus]}`}>
                            {MEMO_STATUS_LABELS_AR[memoStatus]}
                          </span>
                          {memo.sharedWithClient && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">مشارَكة مع العميل</span>
                          )}
                        </div>
                        <CardDescription dir="ltr" className="text-right text-xs mt-2">
                          آخر تعديل: {new Date(memo.updatedAt).toLocaleDateString('ar-EG', { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 flex-1">
                        <div 
                          className="text-gray-600 text-sm line-clamp-4 leading-relaxed font-serif"
                          dangerouslySetInnerHTML={{ __html: memo.content }}
                        />
                      </CardContent>
                      <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between gap-2 mt-auto rounded-b-xl">
                         <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-[#133B2E] hover:bg-white bg-white shadow-sm border border-gray-200"
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              const stamped = office.officialStampUrl && (memoStatus === "APPROVED" || memoStatus === "FILED");
                              if (printWindow) {
                                printWindow.document.write(`
                                  <html dir="rtl">
                                    <head>
                                      <title>${memo.title}</title>
                                      <style>
                                        body { font-family: 'Tajawal', serif; padding: 0; margin: 0; line-height: 1.8; }
                                        h1 { text-align: center; color: #133B2E; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; }
                                        .meta { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                                        .content { font-size: 14pt; text-align: justify; }
                                      </style>
                                    </head>
                                    <body>
                                      ${renderLetterheadHeader(office.officeProfile)}
                                      <div style="padding: 40px 50px;">
                                        <h1>${memo.title}</h1>
                                        <div class="meta">قضية رقم: ${data.caseNumber} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                                        <div class="content">${memo.content}</div>
                                      </div>
                                      ${renderLetterheadFooter(office.officeProfile, { stampUrl: stamped ? office.officialStampUrl : null })}
                                      <script>window.onload = function() { window.print(); window.close(); }</script>
                                    </body>
                                  </html>
                                `);
                                printWindow.document.close();
                              }
                            }}
                          >
                            طباعة
                          </Button>
                          {a.canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[#133B2E] hover:bg-white bg-white shadow-sm border border-gray-200"
                              title="فتح المذكرة وتعديل محتواها"
                              onClick={() => {
                                setEditingMemoId(memo.id);
                                setMemoTitle(memo.title);
                                setMemoType(memo.type || "LAWSUIT");
                                setMemoContent(memo.content);
                                setIsWritingMemo(true);
                              }}
                            >
                              <Edit className="ml-1.5 h-3.5 w-3.5" /> تعديل
                            </Button>
                          )}
                          {a.canSubmitForReview && (
                            <Button variant="outline" size="sm" disabled={memoBusy} onClick={() => moveMemo(memo, "UNDER_REVIEW")}
                              className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs">
                              إرسال للمراجعة
                            </Button>
                          )}
                          {a.canReview && (
                            <Button variant="outline" size="sm" disabled={memoBusy} onClick={() => moveMemo(memo, "PENDING_APPROVAL")}
                              className="rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50 text-xs">
                              تمت المراجعة
                            </Button>
                          )}
                          {a.canApprove && (
                            <Button variant="outline" size="sm" disabled={memoBusy} onClick={() => moveMemo(memo, "APPROVED")}
                              className="rounded-xl border-green-200 text-green-700 hover:bg-green-50 text-xs">
                              <CheckCircle2 className="ml-1 h-3.5 w-3.5" /> اعتماد
                            </Button>
                          )}
                          {a.canReject && (
                            <Button variant="ghost" size="sm" disabled={memoBusy} onClick={() => handleRejectMemo(memo)}
                              className="rounded-xl text-orange-600 hover:bg-orange-50 text-xs">
                              رفض
                            </Button>
                          )}
                          {a.canFile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-700 hover:text-green-800 hover:bg-green-50 bg-white shadow-sm border border-gray-200"
                              title="تحويلها لـ PDF وإرفاقها بالجلسة"
                              onClick={() => {
                                setSelectedMemoForHearing(memo);
                                setIsHearingSelectOpen(true);
                              }}
                            >
                              رفع للجلسة
                            </Button>
                          )}
                          {a.canShare && (
                            <Button variant="ghost" size="sm" disabled={memoBusy} onClick={() => toggleShareMemo(memo)}
                              className="rounded-xl text-blue-600 hover:bg-blue-50 text-xs">
                              {memo.sharedWithClient ? "إلغاء المشاركة" : "مشاركة مع العميل"}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="text-purple-600 hover:text-purple-800 hover:bg-purple-100" title="استخراج أهم النقاط القانونية بالذكاء الاصطناعي" onClick={() => setActiveAiTarget({ target: memo, type: 'memo' })}>
                            <Sparkles className="w-4 h-4" />
                          </Button>
                        </div>
                        {a.canDelete && (
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </Card>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <Card className="shadow-sm border-blue-100">
              <CardHeader className="bg-blue-50/50 pb-4 border-b border-blue-100">
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <FileSignature className="w-5 h-5 text-blue-600" />
                  {editingMemoId ? "تعديل المذكرة" : "كتابة مذكرة أو صحيفة جديدة"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-bold text-[#133B2E]">عنوان المذكرة / المستند</label>
                    <Input 
                      placeholder="مثال: صحيفة دعوى تعويض، مذكرة دفاع..." 
                      className="text-lg bg-gray-50"
                      value={memoTitle}
                      onChange={e => setMemoTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#133B2E]">النوع</label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={memoType}
                      onChange={e => setMemoType(e.target.value)}
                    >
                      <option value="LAWSUIT">صحيفة دعوى</option>
                      <option value="MEMO">مذكرة رد / دفاع</option>
                      <option value="PLEADING">مذكرة مرافعة</option>
                    </select>
                  </div>
                </div>
                
                {/* يمين: صفحة المحرر بنظام الوورد — يسار: المساعد الذكي */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
                  <div className="rounded-2xl bg-gray-100 border border-gray-200 p-3 sm:p-6">
                    <div className="mx-auto max-w-[850px] bg-white shadow-md">
                      <RichTextEditor
                        value={memoContent}
                        onChange={(val) => setMemoContent(val)}
                        placeholder="ابدأ الكتابة هنا..."
                      />
                    </div>
                  </div>
                  <MemoAiPanel
                    caseData={data}
                    memoTypeLabel={MEMO_TYPE_LABELS[memoType] || "مذكرة"}
                    editorHtml={memoContent}
                    buildDraftPrompt={() => buildMemoPrompt(memoType)}
                    onInsert={(html) => { ensureMemoTitle(); setMemoContent((prev) => (prev ? `${prev}\n${html}` : html)); }}
                    onReplace={(html) => {
                      if (memoContent && !confirm("سيُستبدل محتوى المحرر بالكامل بهذا النص. متابعة؟")) return;
                      ensureMemoTitle();
                      setMemoContent(html);
                    }}
                    onFillTemplate={() => {
                      if (memoContent && !confirm("سيُستبدل محتوى المحرر بنموذج جاهز يسحب بيانات القضية. متابعة؟")) return;
                      handleMemoTypeChange(memoType, true);
                    }}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button variant="outline" onClick={() => { setIsWritingMemo(false); setEditingMemoId(null); }}>إلغاء</Button>
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700 text-white" 
                    onClick={async () => {
                      await handleSaveMemo();
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(`
                          <html dir="rtl">
                            <head>
                              <title>${memoTitle}</title>
                              <style>
                                body { font-family: 'Tajawal', serif; padding: 50px; line-height: 1.8; }
                                h1 { text-align: center; color: #133B2E; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; }
                                .meta { color: #666; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                                .content { font-size: 14pt; text-align: justify; }
                              </style>
                            </head>
                            <body>
                              <h1>${memoTitle}</h1>
                              <div class="meta">قضية رقم: ${data.caseNumber} | تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}</div>
                              <div class="content">${memoContent}</div>
                              <script>window.onload = function() { window.print(); window.close(); }</script>
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                      }
                    }}
                    disabled={!memoTitle || !memoContent}
                  >
                    <Download className="ml-2 h-4 w-4" /> حفظ وطباعة فورية
                  </Button>
                  <Button 
                    className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white" 
                    onClick={handleSaveMemo}
                    disabled={!memoTitle || !memoContent}
                  >
                    <Save className="ml-2 h-4 w-4" /> {editingMemoId ? "حفظ التعديلات" : "حفظ المذكرة فقط"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="docs" className="mt-8 outline-none space-y-6">
          <Documents 
            embeddedCaseId={id} 
            embeddedClientId={data.clientId} 
          />
        </TabsContent>

        <TabsContent value="decisions" className="mt-8 outline-none space-y-6">
          <CaseDecisions caseData={data} onSave={handleSaveDecisions} />
        </TabsContent>

        <TabsContent value="judgment" className="mt-8 outline-none space-y-6">
          <CaseJudgments
            caseData={data}
            onSave={handleSaveJudgments}
            onAnalyze={(j) => setActiveAiTarget({
              target: {
                title: "الحكم الصادر في قضية " + data.title,
                content: `تاريخ الحكم: ${j.judgmentDate}\n\nمنطوق الحكم:\n${j.ruling}\n\nأسباب وتفاصيل الحكم:\n${j.details}`,
              },
              type: 'memo',
            })}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-8 outline-none space-y-6">
          {(() => {
            const profile = office.officeProfile;
            const now = new Date();
            const sortedHearings = [...(data.hearings || [])].sort(
              (a: any, b: any) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime()
            );
            const pastHearings = sortedHearings.filter((h: any) => h.hearingDate && new Date(h.hearingDate) < now);
            const upcomingHearings = sortedHearings.filter((h: any) => h.hearingDate && new Date(h.hearingDate) >= now);
            const judgmentLabel = data.finalJudgment ? "صادر" : "لم يصدر بعد";
            const judgmentColor = data.finalJudgment ? "#0f9d58" : "#b8962e";
            // ٦ خانات hex فقط — html2canvas (المستخدمة داخل html2pdf.js) لا تدعم صيغة 8 خانات (RRGGBBAA)
            const judgmentBg = data.finalJudgment ? "#eafaf1" : "#fdf6e6";
            const addressee = reportAudience === "CLIENT"
              ? `السيد/ة الفاضل/ة: ${data.client?.fullName || "العميل الموقّر"}`
              : "إلى: مدير المكتب";
            const clientPhone = toWhatsAppNumber(data.client?.phone);

            const hearingCard = (h: any, isPast: boolean) => `
              <div style="background:#fff; border:1px solid #eee; border-right:4px solid ${isPast ? "#0f9d58" : "#2563eb"}; border-radius:12px; padding:14px 18px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                  <strong style="color:#133B2E; font-size:11pt;">${h.hearingDate ? new Date(h.hearingDate).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' }) : '—'}</strong>
                  <span style="background:${isPast ? "#e6f6ec" : "#eef4ff"}; color:${isPast ? "#0f9d58" : "#2563eb"}; border-radius:999px; padding:3px 12px; font-size:9pt; font-weight:bold;">${isPast ? "انعقدت" : "قادمة"}</span>
                </div>
                <div style="font-size:9.5pt; color:#888; margin-top:4px;">${[h.court, h.circuit ? `دائرة: ${h.circuit}` : ""].filter(Boolean).join(" — ") || "—"}</div>
                ${h.requiredActions ? `<div style="margin-top:8px; font-size:10.5pt;"><strong style="color:#133B2E;">ما تم في الجلسة:</strong> ${h.requiredActions}</div>` : ""}
                ${h.result ? `<div style="margin-top:6px; font-size:10.5pt; background:#fdf2f2; color:#b91c1c; border-radius:8px; padding:8px 12px;"><strong>القرار / النتيجة:</strong> ${h.result}</div>` : ""}
                ${h.judgmentText ? `<div style="margin-top:6px; font-size:10.5pt; background:#eefaf1; color:#0f9d58; border-radius:8px; padding:8px 12px;"><strong>صدر حكم/قرار في هذه الجلسة:</strong> ${h.judgmentText}</div>` : ""}
                ${(!isPast && !h.result && !h.requiredActions) ? `<div style="margin-top:6px; font-size:10pt; color:#999;">لم تنعقد بعد</div>` : ""}
              </div>
            `;

            const reportBodyHtml = `
              <div style="font-family: 'Tajawal', sans-serif; direction: rtl; text-align: right; padding: 0; position: relative; min-height: 100%; background:#fff;">
                ${renderLetterheadHeader(profile)}

                <div style="padding: 30px 40px;">
                  <h1 style="text-align:center; font-size:19pt; color:#133B2E; margin:0 0 4px; letter-spacing:0.5px;">تقرير حالة القضية</h1>
                  <p style="text-align:center; font-size:10.5pt; color:#D4AF37; font-weight:bold; margin-bottom:22px;">${addressee}</p>

                  <div style="background:#f8f9f8; border-radius:14px; padding:18px 20px; margin-bottom:22px; font-size:11pt; line-height:2;">
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                      <span><strong style="color:#133B2E;">رقم القضية:</strong> ${data.caseNumber || '—'}</span>
                      <span><strong style="color:#133B2E;">النوع:</strong> ${data.type || '—'}</span>
                      <span><strong style="color:#133B2E;">الحالة:</strong> ${data.status || '—'}</span>
                    </div>
                    <div style="margin-top:4px;"><strong style="color:#133B2E;">عنوان القضية:</strong> ${data.title || '—'}</div>
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; margin-top:4px;">
                      <span><strong style="color:#133B2E;">العميل:</strong> ${data.client?.fullName || '—'}</span>
                      <span><strong style="color:#133B2E;">الخصم:</strong> ${data.opponentName || '—'}</span>
                    </div>
                    <div style="margin-top:4px;"><strong style="color:#133B2E;">المحكمة:</strong> ${data.courtName || '—'}</div>
                  </div>

                  <h2 style="font-size:13pt; color:#133B2E; border-bottom:2px solid #D4AF37; padding-bottom:6px; margin-bottom:14px;">الجلسات التي انعقدت</h2>
                  ${pastHearings.length > 0 ? pastHearings.map((h: any) => hearingCard(h, true)).join("") : `<p style="color:#999; font-size:10.5pt; margin-bottom:18px;">لا توجد جلسات منعقدة بعد.</p>`}

                  <h2 style="font-size:13pt; color:#133B2E; border-bottom:2px solid #D4AF37; padding-bottom:6px; margin:22px 0 14px;">الجلسات القادمة</h2>
                  ${upcomingHearings.length > 0 ? upcomingHearings.map((h: any) => hearingCard(h, false)).join("") : `<p style="color:#999; font-size:10.5pt; margin-bottom:18px;">لا توجد جلسات قادمة مجدولة حالياً.</p>`}

                  ${isExecutionCase ? `
                    <div style="background:#fff8e6; border:1px solid #f0e0b0; border-radius:12px; padding:12px 18px; margin:18px 0; font-size:10.5pt;">
                      <strong style="color:#b8962e;">نسبة إنجاز إجراءات التنفيذ:</strong> ${enforcementProgress}%
                    </div>
                  ` : ""}

                  <h2 style="font-size:13pt; color:#133B2E; border-bottom:2px solid #D4AF37; padding-bottom:6px; margin:22px 0 14px;">الحكم القضائي</h2>
                  <div style="border:1px solid ${judgmentColor}; border-radius:12px; padding:14px 18px;">
                    <span style="display:inline-block; background:${judgmentBg}; color:${judgmentColor}; border-radius:999px; padding:5px 14px; font-size:10pt; font-weight:bold; margin-bottom:${data.finalJudgment ? "10px" : "0"};">
                      الحالة: ${judgmentLabel}
                    </span>
                    ${data.finalJudgment ? `
                      <div style="font-size:10.5pt; color:#666; margin-bottom:6px;">تاريخ الصدور: ${new Date(data.finalJudgment.judgmentDate).toLocaleDateString('ar-EG', { year:'numeric', month:'long', day:'numeric' })}</div>
                      <div style="font-size:10.5pt; color:#333; white-space:pre-wrap;"><strong>منطوق الحكم:</strong> ${data.finalJudgment.judgmentRuling || "—"}</div>
                    ` : ""}
                  </div>
                </div>

                ${renderLetterheadFooter(profile, { stampUrl: office.officialStampUrl })}
              </div>
            `;

            const ensureHtml2pdf = async () => {
              if ((window as any).html2pdf) return;
              const script = window.document.createElement("script");
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
              script.async = true;
              window.document.body.appendChild(script);
              await new Promise<void>((resolve, reject) => {
                script.onload = () => resolve();
                script.onerror = (err) => reject(err);
              });
            };

            const reportPdfOptions = {
              margin: 0,
              filename: `تقرير حالة القضية - ${data.caseNumber || data.title}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, onclone: stripUnsupportedColorsOnClone },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            };

            const handleDownloadPdf = async () => {
              setIsGeneratingReportPdf(true);
              try {
                await ensureHtml2pdf();
                const element = document.createElement("div");
                element.innerHTML = reportBodyHtml;
                document.body.appendChild(element);
                await (window as any).html2pdf().from(element).set(reportPdfOptions).save();
                document.body.removeChild(element);
              } catch (err) {
                console.error(err);
                alert("تعذّر توليد ملف PDF: " + (err instanceof Error ? err.message : String(err)));
              } finally {
                setIsGeneratingReportPdf(false);
              }
            };

            const handleSendWhatsApp = async () => {
              if (!clientPhone) {
                alert("لا يوجد رقم جوال مسجَّل للعميل. أضفه من ملف العميل أولاً.");
                return;
              }
              setIsSendingReportWhatsApp(true);
              try {
                await ensureHtml2pdf();
                const element = document.createElement("div");
                element.innerHTML = reportBodyHtml;
                document.body.appendChild(element);
                const pdfBlob = await (window as any).html2pdf().from(element).set(reportPdfOptions).output('blob');
                document.body.removeChild(element);

                const fileOfBlob = new window.File([pdfBlob], `تقرير حالة القضية - ${data.caseNumber || data.title}.pdf`, { type: 'application/pdf' });
                const fd = new FormData();
                fd.append("file", fileOfBlob);
                const response = await fetch("/upload.php", { method: "POST", body: fd });
                if (!response.ok) throw new Error("فشل رفع التقرير");
                const uploadResult = await response.json();
                if (uploadResult.error) throw new Error(uploadResult.error);

                const message = `مرحباً ${data.client?.fullName || ""}،\nمرفق تقرير حالة القضية «${data.title || data.caseNumber}»:\n${uploadResult.fileUrl}`;
                window.open(`https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`, "_blank");
              } catch (err) {
                console.error(err);
                alert("تعذّر تجهيز التقرير لإرساله عبر واتساب: " + (err instanceof Error ? err.message : String(err)));
              } finally {
                setIsSendingReportWhatsApp(false);
              }
            };

            return (
              <Card className="shadow-lg border border-teal-200/60 overflow-hidden bg-white">
                <CardHeader className="pb-4 bg-teal-50/30 border-b border-teal-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <CardTitle className="text-lg text-[#133B2E] flex items-center gap-2">
                      <FileBarChart className="text-teal-600 w-5 h-5" /> تقرير حالة القضية
                    </CardTitle>
                    <CardDescription className="text-gray-500 text-xs">
                      ملخّص جاهز للطباعة أو التحميل أو الإرسال مباشرة عبر واتساب، على ترويسة المكتب.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1 shrink-0">
                    <button onClick={() => setReportAudience("OFFICE")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${reportAudience === "OFFICE" ? "bg-[#133B2E] text-[#D4AF37]" : "text-gray-500"}`}>
                      نسخة صاحب المكتب
                    </button>
                    <button onClick={() => setReportAudience("CLIENT")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${reportAudience === "CLIENT" ? "bg-[#133B2E] text-[#D4AF37]" : "text-gray-500"}`}>
                      نسخة العميل
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="border-b border-gray-100 bg-gray-100/60 p-4 sm:p-8">
                    <div className="max-w-2xl mx-auto shadow-xl rounded-2xl overflow-hidden" dangerouslySetInnerHTML={{ __html: reportBodyHtml }} />
                  </div>
                  <div className="p-4 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(`<html dir="rtl"><head><title>تقرير حالة القضية</title></head><body>${reportBodyHtml}<script>window.onload=function(){window.print();window.close();}</script></body></html>`);
                          printWindow.document.close();
                        }
                      }}
                      className="border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      <Printer className="ml-2 h-4 w-4" /> طباعة
                    </Button>
                    <Button
                      disabled={isGeneratingReportPdf}
                      onClick={handleDownloadPdf}
                      variant="outline"
                      className="border-[#133B2E] text-[#133B2E] hover:bg-gray-50"
                    >
                      {isGeneratingReportPdf ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
                      تحميل PDF
                    </Button>
                    <Button
                      disabled={isSendingReportWhatsApp}
                      onClick={handleSendWhatsApp}
                      title={clientPhone ? `إرسال إلى ${clientPhone}` : "لا يوجد رقم جوال مسجَّل للعميل"}
                      className="bg-[#25D366] hover:bg-[#1fb855] text-white"
                    >
                      {isSendingReportWhatsApp ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <MessageCircle className="ml-2 h-4 w-4" />}
                      إرسال واتساب للعميل
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

      </Tabs>
      </div>
    </div>
  );
}
