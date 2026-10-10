/**
 * مرفقات تُرسل للذكاء الاصطناعي (المساعد في المذكرات وصفحة المساعد القانوني).
 * PDF والصور تُرسل لـ Gemini مضمّنة فيقرؤها بنفسه (حتى الممسوحة ضوئياً)،
 * وملفات Word والنص يُستخرج نصها في المتصفح. لا شيء من ذلك يُرفع للخادم أو يُحفظ.
 */

import type { GeminiPart } from "./aiProxy";

export interface AiAttachment {
  id: string;
  name: string;
  size: number;
  /** inline: يُرسل الملف نفسه (PDF/صورة) — text: نص مستخرج (Word/نص) */
  kind: "inline" | "text";
  mimeType?: string;
  data?: string;
  text?: string;
}

export const AI_MAX_FILES = 5;
export const AI_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 40000;
const INLINE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const AI_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt";

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`تعذّرت قراءة ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function toAiAttachment(file: File): Promise<AiAttachment> {
  const id = Math.random().toString(36).slice(2);
  const base = { id, name: file.name, size: file.size };
  const lower = file.name.toLowerCase();
  if (INLINE_TYPES.includes(file.type)) {
    return { ...base, kind: "inline", mimeType: file.type, data: await readAsBase64(file) };
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { ...base, kind: "text", text: value.slice(0, MAX_TEXT_CHARS) };
  }
  if (file.type === "text/plain" || lower.endsWith(".txt")) {
    return { ...base, kind: "text", text: (await file.text()).slice(0, MAX_TEXT_CHARS) };
  }
  throw new Error(`نوع الملف «${file.name}» غير مدعوم — المدعوم: PDF، صور، Word (docx)، نص`);
}

/** يضيف ملفات لقائمة قائمة مع احترام حد العدد والحجم — يرمي رسالة واضحة عند التجاوز */
export async function addAiFiles(current: AiAttachment[], files: File[]): Promise<AiAttachment[]> {
  const next = [...current];
  for (const file of files) {
    if (next.length >= AI_MAX_FILES) throw new Error(`الحد الأقصى ${AI_MAX_FILES} مرفقات.`);
    const total = next.reduce((s, a) => s + a.size, 0) + file.size;
    if (total > AI_MAX_TOTAL_BYTES) throw new Error(`حجم المرفقات يتجاوز ${formatSize(AI_MAX_TOTAL_BYTES)} — احذف بعضها أو أرفق ملفات أصغر.`);
    next.push(await toAiAttachment(file));
  }
  return next;
}

/** نص المرفقات النصية — يُلحق بنص الطلب */
export const attachmentsText = (attachments: AiAttachment[]) => attachments
  .filter((a) => a.kind === "text")
  .map((a) => `\n--- بداية المرفق: ${a.name} ---\n${a.text}\n--- نهاية المرفق: ${a.name} ---`)
  .join("\n");

/** أجزاء Gemini للمرفقات المضمّنة (PDF/صور) */
export const inlineParts = (attachments: AiAttachment[]): GeminiPart[] => attachments
  .filter((a) => a.kind === "inline")
  .map((a) => ({ inlineData: { mimeType: a.mimeType!, data: a.data! } }));

export const hasInline = (attachments: AiAttachment[]) => attachments.some((a) => a.kind === "inline");
