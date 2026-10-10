/**
 * تقرير حالة القضية — نسختان (صاحب المكتب / العميل) على ترويسة المكتب الرسمية،
 * مع «ملخص ذكي» يكتبه الذكاء الاصطناعي من بيانات القضية الفعلية.
 *
 * التقرير HTML بأنماط inline وجداول فقط — نفس الشكل في المعاينة والطباعة و PDF
 * (html2canvas لا تفهم Tailwind ولا oklch ولا ألوان hex بثماني خانات).
 * الملخص الذكي يُحفظ في `cases/{id}.reportAi.{OFFICE|CLIENT}` فلا يُعاد توليده كل مرة.
 */

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Download, FileBarChart, Loader2, MessageCircle, Printer, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { callGemini, callGroq, readAiSettings } from "../lib/aiProxy";
import { formatGregorian } from "../lib/calendar";
import { clientRoleLabelOf, clientRoleOf } from "../lib/clientRole";
import { caseTypeLabel, isExecutionCase as isExecutionType } from "../lib/caseTypes";
import { executionDetailsOf, formatMoney, remainingAmount } from "../lib/execution";
import { assignedLawyersLabel } from "../lib/assignedLawyers";
import { COURT_DEGREE_LABELS_AR, REQUEST_STATUS_LABELS_AR, isOpenRequest, type CaseRequest } from "../lib/caseRequests";
import { renderMemoLetterheadFooter, renderMemoLetterheadHeader } from "../lib/letterhead";
import { ensureHtml2pdf, stripUnsupportedColorsOnClone, toWhatsAppNumber } from "../lib/reportUtils";
import type { OfficeProfile } from "../lib/officeSettings";
import { judgmentsOf } from "./CaseJudgments";
import { decisionsOf } from "./CaseDecisions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

type Audience = "OFFICE" | "CLIENT";

const GREEN = "#133B2E";
const GREEN_2 = "#1a9a45";
const GOLD = "#D4AF37";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const STATUS_AR: Record<string, string> = {
  OPEN: "مفتوحة", ACTIVE: "مفتوحة", CLOSED: "مغلقة", ARCHIVED: "مؤرشفة",
  PENDING: "معلّقة", SUSPENDED: "موقوفة", DONE: "مكتملة", COMPLETED: "مكتملة",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** يقبل من رد الذكاء الاصطناعي وسوم التنسيق البسيطة فقط، بلا أي سمات */
function sanitizeAiHtml(html: string): string {
  const allowed = new Set(["P", "H3", "H4", "UL", "OL", "LI", "STRONG", "B", "EM", "BR"]);
  const src = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild!;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const inner = Array.from(el.childNodes).map(walk).join("");
    if (!allowed.has(el.tagName)) return inner;
    const tag = el.tagName.toLowerCase();
    return tag === "br" ? "<br/>" : `<${tag}>${inner}</${tag}>`;
  };
  return Array.from(src.childNodes).map(walk).join("");
}

/** تنسيق الملخص الذكي داخل التقرير — inline لأن html2canvas تتجاهل الأنماط العامة */
const styleAiHtml = (html: string) => html
  .replace(/<h3>/g, `<h3 style="font-size:11.5pt; font-weight:bold; color:${GREEN}; margin:12px 0 4px;">`)
  .replace(/<h4>/g, `<h4 style="font-size:10.5pt; font-weight:bold; color:${GREEN}; margin:10px 0 4px;">`)
  .replace(/<p>/g, `<p style="margin:0 0 6px;">`)
  .replace(/<ul>/g, `<ul style="margin:0 0 6px; padding-right:20px; list-style:disc;">`)
  .replace(/<ol>/g, `<ol style="margin:0 0 6px; padding-right:20px; list-style:decimal;">`)
  .replace(/<strong>/g, `<strong style="font-weight:bold;">`)
  .replace(/<li>/g, `<li style="margin-bottom:3px;">`);

const sectionTitle = (title: string, count?: number) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:26px 0 12px;">
    <tr>
      <td style="width:6px; background:${GOLD}; border-radius:3px;"></td>
      <td style="padding-right:10px; font-size:13pt; font-weight:bold; color:${GREEN};">${title}</td>
      ${count !== undefined ? `<td style="text-align:left; font-size:9.5pt; color:${MUTED};">${count} ${count === 1 ? "سجل" : "سجلات"}</td>` : ""}
    </tr>
  </table>`;

const emptyNote = (text: string) =>
  `<div style="padding:14px 16px; border:1px dashed ${LINE}; border-radius:10px; color:${MUTED}; font-size:10pt; text-align:center;">${text}</div>`;

interface ReportInput {
  data: any;
  profile: OfficeProfile;
  stampUrl: string | null;
  audience: Audience;
  aiHtml: string;
  isExecutionCase: boolean;
  enforcementProgress: number;
}

export function renderCaseReportHtml({ data, profile, stampUrl, audience, aiHtml, isExecutionCase, enforcementProgress }: ReportInput): string {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const hearings = [...(data.hearings || [])].filter((h: any) => h.hearingDate);
  const past = hearings.filter((h: any) => h.hearingDate.slice(0, 10) < todayKey)
    .sort((a: any, b: any) => b.hearingDate.localeCompare(a.hearingDate));
  const upcoming = hearings.filter((h: any) => h.hearingDate.slice(0, 10) >= todayKey)
    .sort((a: any, b: any) => a.hearingDate.localeCompare(b.hearingDate));
  const judgments = [...judgmentsOf(data)].sort((a, b) => (b.judgmentDate || "").localeCompare(a.judgmentDate || ""));
  const decisions = [...decisionsOf(data)].sort((a, b) => (b.decisionDate || "").localeCompare(a.decisionDate || ""));
  const requests: CaseRequest[] = [...(data.requests || [])].sort((a, b) => (b.requestDate || "").localeCompare(a.requestDate || ""));
  const openRequests = requests.filter(isOpenRequest);
  const finalJudgment = judgments.find((j) => j.isFinal);
  const forClient = audience === "CLIENT";
  const exec = isExecutionCase || isExecutionType(data);

  const statusAr = STATUS_AR[data.status] || "مفتوحة";
  const role = clientRoleLabelOf(data);
  const court = [data.courtName, data.courtCircle].filter(Boolean).join(" — ");

  // بطاقات المؤشرات أعلى التقرير
  const kpi = (label: string, value: string, color = GREEN) => `
    <td style="width:25%; padding:0 5px;">
      <div style="border:1px solid ${LINE}; border-radius:12px; padding:12px 10px; text-align:center; background:#fff;">
        <div style="font-size:8.5pt; color:${MUTED}; margin-bottom:4px;">${label}</div>
        <div style="font-size:12.5pt; font-weight:bold; color:${color};">${value}</div>
      </div>
    </td>`;

  const infoRow = (pairs: [string, string][]) => `
    <tr>${pairs.map(([k, v]) => `
      <td style="width:18%; padding:9px 12px; font-size:9.5pt; color:${MUTED}; background:#f9fafb; border-bottom:1px solid ${LINE};">${k}</td>
      <td style="width:32%; padding:9px 12px; font-size:10.5pt; font-weight:bold; color:#111827; border-bottom:1px solid ${LINE};">${v || "—"}</td>`).join("")}
    </tr>`;

  const hearingRow = (h: any, isPast: boolean) => `
    <tr>
      <td style="width:110px; vertical-align:top; padding:12px 0 12px 12px; border-bottom:1px solid ${LINE};">
        <div style="background:${isPast ? "#ecfdf3" : "#eff6ff"}; color:${isPast ? GREEN_2 : "#2563eb"}; border-radius:10px; padding:8px 6px; text-align:center;">
          <div style="font-size:10pt; font-weight:bold;">${esc(formatGregorian(h.hearingDate))}</div>
          <div style="font-size:8pt; margin-top:2px;">${isPast ? "انعقدت" : "قادمة"}</div>
        </div>
      </td>
      <td style="vertical-align:top; padding:12px 0; border-bottom:1px solid ${LINE}; font-size:10.5pt; line-height:1.7;">
        <div style="color:${MUTED}; font-size:9pt;">${esc([h.court, h.circuit].filter(Boolean).join(" — ")) || "—"}</div>
        ${h.requiredActions ? `<div><strong style="color:${GREEN};">ملخص الجلسة:</strong> ${esc(h.requiredActions)}</div>` : ""}
        ${h.result ? `<div><strong style="color:${GREEN};">القرار / النتيجة:</strong> ${esc(h.result)}</div>` : ""}
        ${h.judgmentText ? `<div style="color:${GREEN_2};"><strong>صدر في الجلسة:</strong> ${esc(h.judgmentText)}</div>` : ""}
        ${!isPast && !h.requiredActions && !h.result ? `<div style="color:${MUTED};">لم تنعقد بعد</div>` : ""}
      </td>
    </tr>`;

  const timeline = (rows: any[], isPast: boolean, empty: string) => rows.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.map((h) => hearingRow(h, isPast)).join("")}</table>`
    : emptyNote(empty);

  const listCard = (title: string, meta: string, body: string, accent: string) => `
    <div style="border:1px solid ${LINE}; border-right:4px solid ${accent}; border-radius:10px; padding:10px 14px; margin-bottom:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
        <td style="font-size:10.5pt; font-weight:bold; color:${GREEN};">${title}</td>
        <td style="text-align:left; font-size:9pt; color:${MUTED};">${meta}</td>
      </tr></table>
      ${body ? `<div style="font-size:10pt; color:#374151; margin-top:4px; line-height:1.7; white-space:pre-wrap;">${body}</div>` : ""}
    </div>`;

  return `
    <div style="font-family:'Tajawal',sans-serif; direction:rtl; text-align:right; background:#fff; color:#111827;">
      ${renderMemoLetterheadHeader(profile)}

      <div style="padding:22px 36px 10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="vertical-align:bottom;">
              <div style="font-size:9pt; color:${GOLD}; font-weight:bold; letter-spacing:0.5px;">${forClient ? "نسخة العميل" : "نسخة داخلية — صاحب المكتب"}</div>
              <div style="font-size:21pt; font-weight:bold; color:${GREEN}; margin-top:2px;">تقرير حالة القضية</div>
              <div style="font-size:10.5pt; color:${MUTED}; margin-top:4px;">${forClient ? `السيد/ة الفاضل/ة: <strong style="color:${GREEN};">${esc(data.client?.fullName || "العميل الموقّر")}</strong>` : "إلى: مدير المكتب"}</div>
            </td>
            <td style="vertical-align:bottom; text-align:left; font-size:9.5pt; color:${MUTED}; line-height:1.8;">
              <div>تاريخ التقرير: <strong style="color:#111827;">${esc(formatGregorian(todayKey))}</strong></div>
              <div>رقم القضية: <strong style="color:#111827;" dir="ltr">${esc(data.caseNumber || "—")}</strong></div>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-top:18px;">
          <tr>
            ${kpi("حالة القضية", statusAr, data.status === "CLOSED" ? MUTED : GREEN_2)}
            ${kpi("جلسات انعقدت", String(past.length))}
            ${kpi("الجلسة القادمة", upcoming[0] ? esc(formatGregorian(upcoming[0].hearingDate)) : "لا يوجد", upcoming[0] ? "#2563eb" : MUTED)}
            ${kpi("الحكم", finalJudgment ? "صدر حكم نهائي" : judgments.length ? "حكم غير نهائي" : "لم يصدر", finalJudgment ? GREEN_2 : "#b8962e")}
          </tr>
        </table>

        ${sectionTitle(exec ? "بيانات طلب التنفيذ" : "بيانات القضية")}
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid ${LINE}; border-radius:10px;">
          ${exec
            ? infoRow([["عنوان الطلب", esc(data.title)], ["نوع الطلب", esc(data.enforcementRequestType || "تنفيذ")]])
            : infoRow([["عنوان القضية", esc(data.title)], ["نوع القضية", esc(caseTypeLabel(data.type))]])}
          ${infoRow([["العميل", esc(data.client?.fullName)], ["الصفة", esc(role)]])}
          ${infoRow([["الخصم", esc(data.opponentName || (clientRoleOf(data) === "DEFENDANT" ? data.plaintiffName : data.defendantName))], ["المحكمة", esc(court)]])}
          ${infoRow([[exec ? "تاريخ تقديم الطلب" : "تاريخ القضية", esc(formatGregorian(data.startDate))], [exec ? "الأشخاص المسؤولون" : "المحامي المسؤول", esc(assignedLawyersLabel(data, profile.name || "—"))]])}
        </table>

        ${exec ? (() => {
          const d = executionDetailsOf(data);
          const rem = remainingAmount(d);
          return `${sectionTitle("مضمون الطلب")}
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
            ${kpi("المدون في السند", d.deedAmount ? esc(formatMoney(d.deedAmount)) : "—")}
            ${kpi("المستلم", esc(formatMoney(d.receivedAmount || 0)), GREEN_2)}
            ${kpi("المتبقي", rem === null ? "—" : esc(formatMoney(rem)), "#b8962e")}
            ${kpi("المطلوب تنفيذه", d.requestedAmount ? esc(formatMoney(d.requestedAmount)) : "—")}
          </tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border:1px solid ${LINE}; margin-top:10px;">
            ${infoRow([["نوع السند", esc(data.enforcementDeedType)], ["تاريخ تحرير السند", esc(d.deedDate ? formatGregorian(d.deedDate) : "")]])}
            ${infoRow([["مكان الصدور", esc([d.deedPlace, d.deedCity].filter(Boolean).join(" — "))], ["حالة الاستحقاق", esc(d.maturityStatus)]])}
          </table>`;
        })() : ""}

        ${aiHtml ? `
          ${sectionTitle(forClient ? "ملخص وضع قضيتكم" : "الملخص الذكي والتحليل")}
          <div style="background:#f7fbf8; border:1px solid #cfe9d8; border-radius:12px; padding:14px 18px; font-size:10.5pt; line-height:1.85; color:#1f2937;">
            ${styleAiHtml(aiHtml)}
            <div style="margin-top:8px; font-size:8pt; color:${MUTED};">✦ أُعدّ هذا الملخص بمساعدة الذكاء الاصطناعي ومراجعة المكتب.</div>
          </div>` : ""}

        ${sectionTitle("الجلسات القادمة", upcoming.length)}
        ${timeline(upcoming, false, "لا توجد جلسات قادمة مجدولة حالياً.")}

        ${sectionTitle("الجلسات التي انعقدت", past.length)}
        ${timeline(past, true, "لا توجد جلسات منعقدة بعد.")}

        ${isExecutionCase ? `
          ${sectionTitle("إجراءات التنفيذ")}
          <div style="border:1px solid ${LINE}; border-radius:10px; padding:12px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
              <td style="font-size:10.5pt; color:${GREEN}; font-weight:bold;">نسبة الإنجاز</td>
              <td style="text-align:left; font-size:12pt; font-weight:bold; color:#b8962e;">${enforcementProgress}%</td>
            </tr></table>
            <div style="height:8px; background:#f3f4f6; border-radius:999px; margin-top:8px; overflow:hidden;">
              <div style="height:8px; width:${Math.max(0, Math.min(100, enforcementProgress))}%; background:${GOLD}; border-radius:999px;"></div>
            </div>
          </div>` : ""}

        ${sectionTitle("الأحكام", judgments.length)}
        ${judgments.length ? judgments.map((j) => listCard(
          `حكم ${j.isFinal ? "نهائي" : "غير نهائي"}${j.deedNumber ? ` — صك ${esc(j.deedNumber)}` : ""}`,
          esc([formatGregorian(j.judgmentDate), COURT_DEGREE_LABELS_AR[j.degree]].filter(Boolean).join(" · ")),
          esc(j.ruling),
          j.isFinal ? GREEN_2 : "#5fb8c2",
        )).join("") : emptyNote("لم يصدر حكم في القضية بعد.")}

        ${decisions.length ? `
          ${sectionTitle("القرارات", decisions.length)}
          ${decisions.slice(0, forClient ? 3 : 10).map((d) => listCard(
            `قرار${d.decisionNumber ? ` ${esc(d.decisionNumber)}` : ""}`, esc(formatGregorian(d.decisionDate)), esc(d.text), "#6366f1",
          )).join("")}` : ""}

        ${!forClient && requests.length ? `
          ${sectionTitle("الطلبات", requests.length)}
          ${requests.slice(0, 10).map((r) => listCard(
            esc(r.type || "طلب"),
            esc([REQUEST_STATUS_LABELS_AR[r.status], formatGregorian(r.requestDate)].filter(Boolean).join(" · ")),
            isOpenRequest(r) && r.followUpDate ? `موعد المتابعة: ${esc(formatGregorian(r.followUpDate))}` : "",
            isOpenRequest(r) ? "#d97706" : "#9ca3af",
          )).join("")}` : ""}
        ${forClient && openRequests.length ? `
          ${sectionTitle("طلبات قيد المتابعة", openRequests.length)}
          ${openRequests.slice(0, 5).map((r) => listCard(esc(r.type || "طلب"), esc(formatGregorian(r.requestDate)), "", "#d97706")).join("")}` : ""}

        <div style="height:18px;"></div>
      </div>

      ${renderMemoLetterheadFooter(profile, { stampUrl })}
    </div>`;
}

/* ────────────────────────── الملخص الذكي ────────────────────────── */

export function buildAiPrompt(data: any, audience: Audience): string {
  // التواريخ بصيغة «1 سبتمبر 2026» — صيغة ISO تنقلب في النص العربي
  const g = (v?: string) => formatGregorian(v);
  const h = (data.hearings || []).filter((x: any) => x.hearingDate)
    .sort((a: any, b: any) => a.hearingDate.localeCompare(b.hearingDate))
    .map((x: any) => `- ${g(x.hearingDate)}: ${[x.requiredActions, x.result && `النتيجة: ${x.result}`, x.judgmentText && `صدر: ${x.judgmentText}`].filter(Boolean).join(" — ") || "لا تفاصيل"}`)
    .join("\n");
  const j = judgmentsOf(data).map((x) => `- ${g(x.judgmentDate)} (${x.isFinal ? "نهائي" : "غير نهائي"}): ${x.ruling}`).join("\n");
  const d = decisionsOf(data).map((x) => `- ${g(x.decisionDate)}: ${x.text}`).join("\n");
  const r = (data.requests || []).map((x: CaseRequest) => `- ${g(x.requestDate)} ${x.type} (${REQUEST_STATUS_LABELS_AR[x.status] || x.status})`).join("\n");

  const facts = `بيانات القضية:
- العنوان: ${data.title || "-"} | الرقم: ${data.caseNumber || "-"} | النوع: ${caseTypeLabel(data.type) || "-"}
- الحالة: ${STATUS_AR[data.status] || "مفتوحة"} | المحكمة: ${data.courtName || "-"} ${data.courtCircle || ""}
- موكلنا: ${data.client?.fullName || "-"} بصفة ${clientRoleLabelOf(data)} | الخصم: ${data.opponentName || "-"}
- موضوع الدعوى: ${data.caseSubject || "-"}
- أسانيد الدعوى: ${data.claimGrounds?.text || "-"}
- طلبات الدعوى: ${data.claimRequests?.text || "-"}
الجلسات (تاريخ اليوم ${g(new Date().toISOString())}):
${h || "- لا توجد"}
الطلبات:
${r || "- لا توجد"}
القرارات:
${d || "- لا توجد"}
الأحكام:
${j || "- لا توجد"}`;

  const task = audience === "CLIENT"
    ? `اكتب ملخصاً موجّهاً للعميل بلغة عربية واضحة ومطمئنة وخالية من المصطلحات المعقدة، في الأقسام التالية:
<h3>أين وصلت قضيتكم</h3> فقرة قصيرة.
<h3>أبرز ما تم</h3> قائمة نقاط مختصرة.
<h3>الخطوة القادمة</h3> ما سيحدث بعد ذلك وما المطلوب من العميل إن وُجد.
ممنوع: كشف الاستراتيجية الداخلية للمكتب، أو الوعد بنتيجة القضية، أو ذكر نسب نجاح.`
    : `اكتب تحليلاً داخلياً لصاحب المكتب بلغة قانونية مهنية، في الأقسام التالية:
<h3>الموقف الحالي</h3> فقرة موجزة.
<h3>أبرز التطورات</h3> قائمة نقاط.
<h3>المخاطر والملاحظات</h3> قائمة نقاط (مواعيد اعتراض، مهل، نواقص في الملف).
<h3>الخطوات المقترحة</h3> قائمة إجراءات عملية مرتبة بالأولوية.`;

  return `أنت محامٍ سعودي خبير تعدّ تقرير حالة قضية.
${facts}

${task}
اعتمد على البيانات أعلاه فقط ولا تختلق وقائع أو تواريخ أو أرقاماً؛ إن نقصت معلومة فاذكر ذلك صراحة.
اكتب التواريخ دائماً بصيغة «1 سبتمبر 2026» كما وردت أعلاه، لا بصيغة 2026-09-01.
أجب بصيغة HTML (<h3> و<p> و<ul><li> و<strong> فقط) بلا <html> أو <body> أو أسوار كود، ولا يزيد الرد عن 250 كلمة.`;
}

async function generateAiSummary(data: any, audience: Audience): Promise<string> {
  const settings = readAiSettings();
  const prompt = buildAiPrompt(data, audience);
  const raw = settings.provider === "GEMINI"
    ? await callGemini([{ role: "user", parts: [{ text: prompt }] }], { temperature: 0.4, maxOutputTokens: 2048 }, settings)
    : await callGroq([{ role: "user", content: prompt }], settings, 0.4);
  const html = sanitizeAiHtml(raw.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, ""));
  if (!html.trim()) throw new Error("لم يرجع الذكاء الاصطناعي نصاً — أعد المحاولة.");
  return html;
}

/* ────────────────────────── الواجهة ────────────────────────── */

export default function CaseStatusReport({ data, profile, stampUrl, isExecutionCase, enforcementProgress, onDataChange }: {
  data: any;
  profile: OfficeProfile;
  stampUrl: string | null;
  isExecutionCase: boolean;
  enforcementProgress: number;
  onDataChange: (patch: Record<string, unknown>) => void;
}) {
  const [audience, setAudience] = useState<Audience>("OFFICE");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [waBusy, setWaBusy] = useState(false);

  const saved = data.reportAi?.[audience] as { html?: string; generatedAt?: string } | undefined;
  const aiHtml = saved?.html ? sanitizeAiHtml(saved.html) : "";
  const html = renderCaseReportHtml({ data, profile, stampUrl, audience, aiHtml, isExecutionCase, enforcementProgress });
  const clientPhone = toWhatsAppNumber(data.client?.phone);
  const fileName = `تقرير حالة القضية - ${data.caseNumber || data.title}${audience === "CLIENT" ? " - نسخة العميل" : ""}.pdf`;

  const saveAi = async (value: { html: string; generatedAt: string } | null) => {
    const reportAi = { ...(data.reportAi || {}) };
    if (value) reportAi[audience] = value; else delete reportAi[audience];
    await updateDoc(doc(db, "cases", data.id), { reportAi, updatedAt: new Date().toISOString() });
    onDataChange({ reportAi });
  };

  const handleGenerate = async () => {
    setAiBusy(true);
    setAiError("");
    try {
      const summary = await generateAiSummary(data, audience);
      await saveAi({ html: summary, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      setAiError(err?.message || "تعذّر توليد الملخص الذكي.");
    } finally {
      setAiBusy(false);
    }
  };

  const buildPdf = async (): Promise<Blob | null> => {
    await ensureHtml2pdf();
    const element = document.createElement("div");
    element.style.width = "794px";
    element.innerHTML = html;
    document.body.appendChild(element);
    try {
      return await (window as any).html2pdf().from(element).set({
        margin: 0, filename: fileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, onclone: stripUnsupportedColorsOnClone },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      }).output("blob");
    } finally {
      document.body.removeChild(element);
    }
  };

  const handleDownload = async () => {
    setPdfBusy(true);
    try {
      const blob = await buildPdf();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      alert("تعذّر توليد ملف PDF: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!clientPhone) { alert("لا يوجد رقم جوال مسجَّل للعميل. أضفه من ملف العميل أولاً."); return; }
    if (audience !== "CLIENT" && !confirm("أنت على النسخة الداخلية لصاحب المكتب. هل تريد إرسالها للعميل فعلاً؟ (يُنصح باختيار «نسخة العميل»)")) return;
    setWaBusy(true);
    try {
      const blob = await buildPdf();
      if (!blob) return;
      const fd = new FormData();
      fd.append("file", new window.File([blob], fileName, { type: "application/pdf" }));
      const response = await fetch("/upload.php", { method: "POST", body: fd });
      if (!response.ok) throw new Error("فشل رفع التقرير");
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      const message = `مرحباً ${data.client?.fullName || ""}،\nمرفق تقرير حالة القضية «${data.title || data.caseNumber}»:\n${result.fileUrl}`;
      window.open(`https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`, "_blank");
    } catch (err) {
      alert("تعذّر تجهيز التقرير لإرساله عبر واتساب: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setWaBusy(false);
    }
  };

  const handlePrint = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><title>تقرير حالة القضية</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap">
      <style>@page { size: A4; margin: 0; } body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style>
      </head><body>${html}<script>document.fonts.ready.then(function(){ window.print(); window.close(); });</script></body></html>`);
    w.document.close();
  };

  return (
    <Card className="overflow-hidden border border-gray-200 bg-white shadow-sm">
      <CardHeader className="border-b border-gray-100 bg-gray-50/60 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-[#133B2E]">
              <FileBarChart className="h-5 w-5 text-[#1a9a45]" /> تقرير حالة القضية
            </CardTitle>
            <CardDescription className="mt-1 text-xs text-gray-500">
              على ترويسة المكتب — اطبعه أو حمّله PDF أو أرسله للعميل عبر واتساب.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
            {(["OFFICE", "CLIENT"] as Audience[]).map((a) => (
              <button key={a} onClick={() => { setAudience(a); setAiError(""); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${audience === a ? "bg-[#133B2E] text-[#D4AF37]" : "text-gray-500 hover:bg-gray-50"}`}>
                {a === "OFFICE" ? "نسخة صاحب المكتب" : "نسخة العميل"}
              </button>
            ))}
          </div>
        </div>

        {/* الملخص الذكي */}
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-purple-100 bg-gradient-to-l from-purple-50/80 to-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white"><Sparkles size={17} /></span>
            <div>
              <p className="text-sm font-bold text-[#133B2E]">
                {audience === "CLIENT" ? "ملخص ذكي مبسّط للعميل" : "ملخص وتحليل ذكي لصاحب المكتب"}
              </p>
              <p className="text-xs text-gray-500">
                {saved?.generatedAt
                  ? `مُضاف للتقرير — أُعدّ في ${formatGregorian(saved.generatedAt)}`
                  : audience === "CLIENT"
                    ? "يشرح للعميل وضع قضيته والخطوة القادمة بلغة بسيطة، دون كشف استراتيجية المكتب."
                    : "يحلل الموقف الحالي والمخاطر والمهل، ويقترح الخطوات القادمة."}
              </p>
              {aiError && <p className="mt-1 text-xs font-bold text-red-600">{aiError}</p>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {saved?.html && (
              <Button size="sm" variant="outline" disabled={aiBusy} onClick={() => void saveAi(null)}
                className="border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="ml-1.5 h-4 w-4" /> إزالة
              </Button>
            )}
            <Button size="sm" disabled={aiBusy} onClick={handleGenerate} className="bg-purple-600 text-white hover:bg-purple-700">
              {aiBusy ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : saved?.html ? <RefreshCw className="ml-1.5 h-4 w-4" /> : <Sparkles className="ml-1.5 h-4 w-4" />}
              {aiBusy ? "جاري التحليل..." : saved?.html ? "إعادة التوليد" : "توليد الملخص الذكي"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto bg-gray-100/70 p-4 sm:p-8">
          <div className="mx-auto w-[794px] max-w-none overflow-hidden rounded-sm bg-white shadow-xl" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 p-4">
          <Button variant="outline" onClick={handlePrint} className="border-gray-200 text-gray-700 hover:bg-gray-50">
            <Printer className="ml-2 h-4 w-4" /> طباعة
          </Button>
          <Button variant="outline" disabled={pdfBusy} onClick={handleDownload} className="border-[#133B2E] text-[#133B2E] hover:bg-gray-50">
            {pdfBusy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />} تحميل PDF
          </Button>
          <Button disabled={waBusy} onClick={handleWhatsApp} title={clientPhone ? `إرسال إلى ${clientPhone}` : "لا يوجد رقم جوال مسجَّل للعميل"}
            className="bg-[#25D366] text-white hover:bg-[#1fb855]">
            {waBusy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <MessageCircle className="ml-2 h-4 w-4" />} إرسال واتساب للعميل
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
