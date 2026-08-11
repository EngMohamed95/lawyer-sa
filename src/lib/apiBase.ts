/**
 * قاعدة عناوين نداءات /api/* — على استضافة Hostinger الحالية، الموقع
 * الثابت (lawyr-sa.smartcodix.com) لا يشغّل Node، فسيرفر الـ Express
 * ينتقل لتطبيق Web App منفصل على نطاق فرعي (مثلاً api.lawyr-sa.smartcodix.com).
 *
 * محلياً (npm run dev) يبقى الفراغ الافتراضي صحيحاً لأن Vite/Express
 * يعملان على نفس الأصل. في البناء الإنتاجي يُضبط VITE_API_BASE_URL
 * كمتغيّر وقت البناء (عنوان عام، ليس سرّاً) ليشير للنطاق الفرعي الجديد.
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
