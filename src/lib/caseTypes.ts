/**
 * أسماء أنواع القضايا — مسمّيات المحاكم السعودية (عامة، جزائية، تجارية، عمالية، أحوال شخصية).
 *
 * القضايا القديمة محفوظة بالأسماء السابقة (مدني، جنائي، أسرة...) أو برموز إنجليزية.
 * لا نعدّل البيانات المحفوظة — نعرض الاسم الجديد دائماً، وتُحفظ القضية بالاسم
 * الجديد تلقائياً عند أول تعديل لها.
 */

const RENAMED: Record<string, string> = {
  "مدني": "عامة", "مدنية": "عامة", "CIVIL": "عامة",
  "جنائي": "جزائية", "جنائية": "جزائية", "جزائي": "جزائية", "CRIMINAL": "جزائية",
  "تجاري": "تجارية", "COMMERCIAL": "تجارية",
  "عمالي": "عمالية", "LABOR": "عمالية",
  "أسرة": "أحوال شخصية", "اسرة": "أحوال شخصية", "أسري": "أحوال شخصية", "FAMILY": "أحوال شخصية",
  "EXECUTION": "تنفيذ", "ENFORCEMENT": "تنفيذ",
};

/** الاسم المعتمد لنوع القضية — يحوّل الأسماء القديمة والرموز الإنجليزية */
export function caseTypeLabel(type: unknown): string {
  const t = typeof type === "string" ? type.trim() : "";
  return RENAMED[t] || t;
}

/** طلب تنفيذ (وليس دعوى) — له نموذج ومسمّيات خاصة */
export const isExecutionCase = (c: { type?: unknown } | null | undefined) => caseTypeLabel(c?.type) === "تنفيذ";

/** يوحّد قائمة أنواع (مثل قائمة المكتب المحفوظة) بالأسماء المعتمدة بلا تكرار */
export function normalizeCaseTypes(list: string[]): string[] {
  return [...new Set(list.map(caseTypeLabel).filter(Boolean))];
}
