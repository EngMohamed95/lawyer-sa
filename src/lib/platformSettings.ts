/**
 * إعدادات الذكاء الاصطناعي على مستوى المنصة كلها — قرار واحد يطبَّق على كل
 * المكاتب (العملاء)، لا إعداد لكل مكتب على حدة.
 *
 * ⚠️ لا تخزّن هنا مفتاح API الفعلي أبداً. المفتاح الحقيقي (GEMINI_API_KEY/
 * GROQ_API_KEY) يبقى متغيّر بيئة على الخادم فقط (راجع src/server/api.ts
 * ووثيقة aiProxy.ts §الثغرة V4) — أي مستند Firestore يقرأه كل المستخدمين
 * المسجَّلين في كل المكاتب، فتخزين المفتاح هنا يعيد فتح نفس الثغرة التي
 * أُغلقت بنقل المفتاح للخادم. هذا الملف يخزّن فقط المزوّد/النموذج المفضَّل
 * والميزات المفعّلة — بيانات غير سرية تحدّد كيف يُستخدَم المفتاح، لا ما هو.
 *
 * التعديل مقصور على SUPER_ADMIN (راجع Settings.tsx تبويب "الذكاء الاصطناعي").
 */

import { useCallback, useSyncExternalStore } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AiProvider = "GEMINI" | "GROQ";

export interface PlatformAiSettings {
  provider: AiProvider;
  model: string;
  aiAnalysisEnabled: boolean;
  aiDraftingEnabled: boolean;
  aiRisksEnabled: boolean;
}

export const DEFAULT_PLATFORM_AI_SETTINGS: PlatformAiSettings = {
  provider: "GEMINI",
  model: "gemini-flash-latest",
  aiAnalysisEnabled: true,
  aiDraftingEnabled: true,
  aiRisksEnabled: true,
};

function sanitize(raw: unknown): PlatformAiSettings {
  const src = (raw && typeof raw === "object") ? (raw as Partial<PlatformAiSettings>) : {};
  const provider: AiProvider = src.provider === "GROQ" ? "GROQ" : "GEMINI";
  const defaultModel = provider === "GROQ" ? "llama-3.3-70b-versatile" : "gemini-flash-latest";
  return {
    provider,
    model: typeof src.model === "string" && src.model ? src.model : defaultModel,
    aiAnalysisEnabled: src.aiAnalysisEnabled !== false,
    aiDraftingEnabled: src.aiDraftingEnabled !== false,
    aiRisksEnabled: src.aiRisksEnabled !== false,
  };
}

let state: PlatformAiSettings = DEFAULT_PLATFORM_AI_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PlatformAiSettings {
  return state;
}

/** القيمة الحالية بلا اشتراك — تُستخدم من aiProxy.ts الذي يحتاج قراءة متزامنة */
export function getPlatformAiSettingsSnapshot(): PlatformAiSettings {
  return state;
}

/** يحمّل إعدادات الذكاء الاصطناعي للمنصة مرة واحدة لكل جلسة */
export async function loadPlatformAiSettings(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const snap = await getDoc(doc(db, "platform_settings", "ai"));
    state = snap.exists() ? sanitize(snap.data()) : DEFAULT_PLATFORM_AI_SETTINGS;
    emit();
  } catch (err) {
    console.error("تعذّر تحميل إعدادات الذكاء الاصطناعي للمنصة:", err);
    loaded = false;
  }
}

/** يحفظ إعدادات الذكاء الاصطناعي للمنصة — SUPER_ADMIN فقط */
export async function savePlatformAiSettings(settings: PlatformAiSettings, userId: string | null): Promise<void> {
  const clean = sanitize(settings);
  await setDoc(
    doc(db, "platform_settings", "ai"),
    { ...clean, updatedAt: new Date().toISOString(), updatedBy: userId ?? null },
    { merge: true },
  );
  state = clean;
  emit();
}

/** Hook للاشتراك في إعدادات الذكاء الاصطناعي للمنصة */
export function usePlatformAiSettings(): PlatformAiSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Hook يضمن تحميل الإعدادات مرة واحدة */
export function useLoadPlatformAiSettings(): () => void {
  return useCallback(() => {
    void loadPlatformAiSettings();
  }, []);
}
