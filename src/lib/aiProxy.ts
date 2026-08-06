/**
 * وسيط نداءات الذكاء الاصطناعي — الميزة 001، الثغرة V4.
 *
 * المشكلة: `VITE_GEMINI_API_KEY` أي متغيّر ببادئة VITE_ يُدمج داخل حزمة
 * الواجهة المنشورة. أي شخص يفتح الموقع ويقرأ ملف الجافاسكربت يستخرج
 * المفتاح ويستهلك حساب المكتب.
 *
 * الحل (القرار AD-4): مفتاح المكتب ينتقل للخادم، والنداء يمرّ عبر
 * `POST /api/ai/generate`. أما مفتاح المستخدم الخاص الذي يُدخله بنفسه في
 * الإعدادات (`sys_aiApiKey`) فيبقى يعمل من المتصفح مباشرةً — هو مفتاحه
 * وقراره، ولا معنى لتمريره عبر خادمنا.
 */

import { auth } from "./firebase";

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
  /** مفتاح المستخدم الخاص إن أدخله — يُستخدم مباشرة من المتصفح */
  userKey: string;
}

export function readAiSettings(): AiSettings {
  const provider = (localStorage.getItem("sys_aiProvider") || "GEMINI") as AiProvider;
  const model =
    localStorage.getItem("sys_aiModel") ||
    (provider === "GEMINI" ? "gemini-flash-latest" : "llama-3.3-70b-versatile");
  return {
    provider,
    model,
    userKey: localStorage.getItem("sys_aiApiKey") || "",
  };
}

/** جزء من محادثة بصيغة Gemini */
export interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

/** رسالة موحّدة حين لا يوجد خادم يستقبل النداء */
const NO_SERVER_MESSAGE =
  "خدمة الذكاء الاصطناعي غير مفعّلة على الخادم. افتح الإعدادات ← الربط والأنظمة " +
  "وأدخل مفتاح Gemini الخاص بك لتشغيل الميزة فوراً.";

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
  return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * ينادي Gemini ويرجع النص.
 * - بمفتاح المستخدم: نداء مباشر من المتصفح.
 * - بدونه: عبر الخادم، فلا يُشحن أي مفتاح في الحزمة.
 */
export async function callGemini(
  contents: GeminiContent[],
  generationConfig: GenerationConfig = { temperature: 0.7, maxOutputTokens: 2048 },
  settings: AiSettings = readAiSettings(),
): Promise<string> {
  const body = { contents, generationConfig };

  // مسار مفتاح المستخدم الخاص — يبقى كما كان
  if (settings.userKey) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent` +
      `?key=${encodeURIComponent(settings.userKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return extractGeminiText(await res.json());
  }

  // مسار مفتاح المكتب — على الخادم
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ provider: "GEMINI", model: settings.model, ...body }),
  });

  if (res.status === 401) {
    throw new Error("انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.");
  }
  if (res.status === 501) {
    throw new Error(
      "خدمة الذكاء الاصطناعي غير مُهيّأة على الخادم. أدخل مفتاحك الخاص من شاشة الإعدادات، " +
      "أو اطلب من مدير النظام ضبط مفتاح المكتب.",
    );
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

/** نداء Groq — بمفتاح المستخدم مباشرةً، أو عبر الخادم */
export async function callGroq(
  messages: { role: string; content: string }[],
  settings: AiSettings = readAiSettings(),
  temperature = 0.7,
): Promise<string> {
  const payload = { model: settings.model, messages, temperature };

  if (settings.userKey) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.userKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "خطأ في معالجة طلب Groq");
    return data.choices?.[0]?.message?.content ?? "";
  }

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ provider: "GROQ", ...payload }),
  });
  if (res.status === 401) {
    throw new Error("انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.");
  }
  if (res.status === 501) {
    throw new Error("خدمة الذكاء الاصطناعي غير مُهيّأة على الخادم. أدخل مفتاحك الخاص من الإعدادات.");
  }
  if (!res.ok) throw new Error(`تعذّر الاتصال بالخدمة (${res.status}).`);
  const data = (await readJsonOrExplain(res)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (data.error) throw new Error(data.error.message || "خطأ في المعالجة");
  return data.choices?.[0]?.message?.content ?? "";
}

/** رسالة موحّدة حين لا يوجد أي مفتاح متاح */
export const NO_AI_KEY_MESSAGE =
  "خدمة الذكاء الاصطناعي غير متاحة حالياً. أدخل مفتاحك الخاص من شاشة الإعدادات.";
