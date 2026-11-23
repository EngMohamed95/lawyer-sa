/**
 * تواريخ السجلات: كانت Timestamp من Firestore، وصارت نصوص ISO من MySQL.
 * هالدوال تقبل الاثنين (وDate والأرقام) — استخدمها بدل .toDate() و .toMillis().
 */

/** نوع أي تاريخ مخزّن: نص ISO، أو Timestamp قديم، أو null */
export type StoredDate = string | { toDate(): Date; toMillis(): number } | Date | number | null | undefined;

export function toDate(v: StoredDate): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "object" && typeof v.toDate === "function") return v.toDate();
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** للترتيب: ملّي ثانية، أو 0 لو ما في تاريخ */
export function toMillis(v: StoredDate): number {
  return toDate(v)?.getTime() ?? 0;
}
