/**
 * المحامون المسؤولون عن القضية — القضية قد يتولاها أكثر من محامٍ.
 *
 * الحقول الجديدة: assignedLawyerIds / assignedLawyerNames (قوائم).
 * الحقلان القديمان يبقيان مُزامَنين لأن الجلسات والتقارير والقواعد تقرؤهما:
 *   assignedLawyerId   = أول محامٍ في القائمة
 *   assignedLawyerName = الأسماء مجموعة بـ «، »
 * القضايا القديمة (حقل مفرد فقط) تُقرأ كقائمة من عنصر واحد.
 */

export interface AssignedLawyersFields {
  assignedLawyerIds: string[];
  assignedLawyerNames: string[];
  assignedLawyerId: string;
  assignedLawyerName: string;
}

/** المحامون المسؤولون عن قضية محفوظة — مع دعم الحقل القديم المفرد */
export function assignedLawyersOf(c: any): { ids: string[]; names: string[] } {
  if (Array.isArray(c?.assignedLawyerIds) && c.assignedLawyerIds.length) {
    const names = Array.isArray(c.assignedLawyerNames) ? c.assignedLawyerNames : [];
    return { ids: c.assignedLawyerIds, names: c.assignedLawyerIds.map((_: string, i: number) => names[i] || "") };
  }
  return c?.assignedLawyerId
    ? { ids: [c.assignedLawyerId], names: [c.assignedLawyerName || ""] }
    : { ids: [], names: [] };
}

/** نص العرض: «محمد، خالد» */
export function assignedLawyersLabel(c: any, fallback = "غير محدد"): string {
  const names = assignedLawyersOf(c).names.filter(Boolean);
  return names.length ? names.join("، ") : fallback;
}

/** يبني حقول الحفظ من قائمة معرّفات مختارة */
export function assignedLawyersFields(ids: string[], lawyers: { id: string; name: string }[]): AssignedLawyersFields {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = unique.map((id) => lawyers.find((l) => l.id === id)?.name || "");
  return {
    assignedLawyerIds: unique,
    assignedLawyerNames: names,
    assignedLawyerId: unique[0] || "",
    assignedLawyerName: names.filter(Boolean).join("، "),
  };
}
