/**
 * استخراج النص من ملف مرفوع (صورة/PDF عبر رؤية Gemini، أو Word عبر mammoth
 * على الخادم) — يمرّ عبر POST /api/extract-text (src/server/api.ts) بنفس
 * أسلوب المصادقة والتعامل مع الأخطاء المستخدم في aiProxy.ts.
 */

import { auth } from "./firebase";

const NO_SERVER_MESSAGE =
  "خدمة استخراج النصوص غير مفعّلة على الخادم حالياً.";

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // بلا توكن سيرد الخادم 401 برسالة واضحة
  }
  return headers;
}

/** يقرأ ملفاً كنص Base64 خام (بلا بادئة data:...;base64,) */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** يستخرج النص من ملف (صورة/PDF/Word) عبر الخادم */
export async function extractTextFromFile(base64: string, mimeType: string): Promise<string> {
  const res = await fetch("/api/extract-text", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });

  if (res.status === 401) {
    throw new Error("انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.");
  }
  if (!res.ok) {
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) throw new Error(NO_SERVER_MESSAGE);
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `تعذّر استخراج نص الملف (${res.status}).`);
  }

  const data = await res.json();
  return data.text || "";
}

/** يستخرج النص من ملف File مباشرة (يجمع القراءة + النداء) */
export async function extractTextFromUploadedFile(file: File): Promise<string> {
  const base64 = await fileToBase64(file);
  return extractTextFromFile(base64, file.type);
}
