/**
 * وسيط نداءات الذكاء الاصطناعي — الميزة 001، الثغرة V4.
 *
 * المشكلة: `VITE_GEMINI_API_KEY` أي متغيّر ببادئة VITE_ يُدمج داخل حزمة
 * الواجهة المنشورة. أي شخص يفتح الموقع ويقرأ ملف الجافاسكربت يستخرج
 * المفتاح ويستهلك حساب المنصة.
 *
 * الحل (القرار AD-4): المفتاح الفعلي (GEMINI_API_KEY/GROQ_API_KEY) يبقى
 * متغيّر بيئة على الخادم فقط، والنداء يمرّ دائماً عبر `POST /api/ai/generate`.
 * لا يوجد مفتاح شخصي يُدخله المستخدم من المتصفح — مفتاح واحد على مستوى
 * المنصة كلها يخدم كل المكاتب، فلا يُشحن أي مفتاح داخل حزمة الواجهة إطلاقاً.
 * المزوّد والنموذج فقط (لا السر) يُضبطان مركزياً — راجع src/lib/platformSettings.ts.
 */

import { auth } from "./firebase";
import { apiUrl } from "./apiBase";
import { getPlatformAiSettingsSnapshot } from "./platformSettings";

export type AiProvider = "GEMINI" | "GROQ";

/**
 * ترويسة المصادقة لنداءات الخادم.
 * مسار الخادم محمي: نقلُ المفتاح إليه يمنع سرقته، لكنه لا يمنع
 * استنزاف الرصيد ما لم يكن الطلب مصادَقاً عليه.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // بلا توكن سيرد الخادم 401 برسالة واضحة — لا نُخفي السبب هنا
  }
  return headers;
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
}

/** يقرأ المزوّد والنموذج من إعدادات المنصة المشتركة — لا مفتاح هنا إطلاقاً */
export function readAiSettings(): AiSettings {
  const platform = getPlatformAiSettingsSnapshot();
  return { provider: platform.provider, model: platform.model };
}

/** جزء من رسالة Gemini — نص، أو ملف مضمّن (PDF/صورة) بترميز base64 */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** جزء من محادثة بصيغة Gemini */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

/** رسالة موحّدة حين لا يوجد خادم يستقبل النداء */
const NO_SERVER_MESSAGE =
  "خدمة الذكاء الاصطناعي غير متاحة حالياً على الخادم. أعد المحاولة بعد قليل، " +
  "وإن استمرت المشكلة تواصل مع مدير المنصة.";

/**
 * يقرأ رد الخادم كـ JSON، ويكتشف حالة «لا خادم».
 *
 * على استضافة تُقدّم الملفات الثابتة فقط، يرد الخادم بصفحة index.html
 * على أي مسار غير موجود — بما فيها /api/*. لولا هذا الفحص لظهر للمستخدم
 * خطأ تحليل JSON غامض بدل سبب واضح وحلٍّ يملكه.
 */
async function readJsonOrExplain(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!type.includes("application/json") || text.trimStart().startsWith("<")) {
    throw new Error(NO_SERVER_MESSAGE);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(NO_SERVER_MESSAGE);
  }
}

function extractGeminiText(data: unknown): string {
  const d = data as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (d?.error) throw new Error(d.error.message || "خطأ في معالجة طلب Gemini");
  // الردود الطويلة قد تأتي مقسّمة على عدة أجزاء
  return (d?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/**
 * ينادي Gemini ويرجع النص، دائماً عبر مسار الخادم — فلا يُشحن أي مفتاح
 * داخل حزمة الواجهة إطلاقاً.
 */
export async function callGemini(
  contents: GeminiContent[],
  generationConfig: GenerationConfig = { temperature: 0.7, maxOutputTokens: 2048 },
  settings: AiSettings = readAiSettings(),
): Promise<string> {
  const body = { contents, generationConfig };

  const res = await fetch(apiUrl("/api/ai/generate"), {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ provider: "GEMINI", model: settings.model, ...body }),
  });

  if (res.status === 401) {
    throw new Error("انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.");
  }
  if (res.status === 501) {
    throw new Error("خدمة الذكاء الاصطناعي غير مُهيّأة على الخادم. تواصل مع مدير المنصة.");
  }
  if (res.status === 429) {
    throw new Error("تجاوزت حد الطلبات المسموح. انتظر قليلاً ثم أعد المحاولة.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`تعذّر الاتصال بخدمة الذكاء الاصطناعي (${res.status}). ${detail.slice(0, 160)}`);
  }

  return extractGeminiText(await readJsonOrExplain(res));
}

/** نداء Groq — دائماً عبر مسار الخادم */
export async function callGroq(
  messages: { role: string; content: string }[],
  settings: AiSettings = readAiSettings(),
  temperature = 0.7,
): Promise<string> {
  const payload = { model: settings.model, messages, temperature };

  const res = await fetch(apiUrl("/api/ai/generate"), {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ provider: "GROQ", ...payload }),
  });
  if (res.status === 401) {
    throw new Error("انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.");
  }
  if (res.status === 501) {
    throw new Error("خدمة الذكاء الاصطناعي غير مُهيّأة على الخادم. تواصل مع مدير المنصة.");
  }
  if (!res.ok) throw new Error(`تعذّر الاتصال بالخدمة (${res.status}).`);
  const data = (await readJsonOrExplain(res)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (data.error) throw new Error(data.error.message || "خطأ في المعالجة");
  return data.choices?.[0]?.message?.content ?? "";
}
