/**
 * قوائم مرجعية قابلة للتعديل من المكتب — أنواع القضايا وأنواع المستندات
 * وفئات المصروفات — محفوظة في Firestore بدل أن تكون مكتوبة داخل الكود.
 *
 * نفس نمط officeSettings.ts (مخزن useSyncExternalStore على مستند
 * office_settings/{lawyerId})، تحت حقل جديد "lookups" في نفس المستند.
 *
 * القيم الافتراضية أدناه مطابقة تماماً لما كان مكتوباً في الكود سابقاً،
 * فلا ينكسر أي مكتب لم يخصّص قوائمه بعد.
 */

import { useCallback, useSyncExternalStore } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface LookupOption {
  value: string;
  label: string;
}

/** مدة نظامية لإجراء معيّن — تُستخدم لضبط مواعيد الردود والطعون وغيرها */
export interface ProcedureDuration {
  id: string;
  label: string;
  days: number;
}

export interface OfficeLookups {
  caseTypes: string[];
  documentTypes: LookupOption[];
  expenseCategories: LookupOption[];
  procedureDurations: ProcedureDuration[];
}

export const DEFAULT_LOOKUPS: OfficeLookups = {
  caseTypes: ["مدني", "جنائي", "تجاري", "عمالي", "أسرة", "إداري", "تنفيذ"],
  documentTypes: [
    { value: "POWER_OF_ATTORNEY", label: "توكيل" },
    { value: "CONTRACT", label: "عقد" },
    { value: "EVIDENCE", label: "دليل إثبات" },
    { value: "JUDGMENT", label: "حكم" },
    { value: "RECEIPT", label: "إيصال / حافظة" },
    { value: "OTHER", label: "أخرى" },
  ],
  expenseCategories: [
    { value: "COURT", label: "رسوم قضائية" },
    { value: "TRANSPORTATION", label: "انتقالات ومواصلات" },
    { value: "DOCUMENT", label: "أوراق ومستندات" },
    { value: "OTHER", label: "أخرى" },
  ],
  // مدد استرشادية قابلة للتعديل بالكامل — راجعها كل مكتب حسب نوع قضاياه ولوائحه
  procedureDurations: [
    { id: "response", label: "الرد على لائحة الدعوى", days: 15 },
    { id: "appeal", label: "الاستئناف", days: 30 },
    { id: "cassation", label: "التمييز", days: 30 },
  ],
};

function sanitize(raw: unknown): OfficeLookups {
  const src = (raw && typeof raw === "object") ? (raw as Partial<OfficeLookups>) : {};
  const caseTypes = Array.isArray(src.caseTypes) && src.caseTypes.length > 0
    ? src.caseTypes.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : DEFAULT_LOOKUPS.caseTypes;

  const isOptionArray = (v: unknown): v is LookupOption[] =>
    Array.isArray(v) && v.every((o) => o && typeof o === "object" && typeof (o as any).value === "string" && typeof (o as any).label === "string");

  const documentTypes = isOptionArray(src.documentTypes) && src.documentTypes.length > 0
    ? src.documentTypes
    : DEFAULT_LOOKUPS.documentTypes;

  const expenseCategories = isOptionArray(src.expenseCategories) && src.expenseCategories.length > 0
    ? src.expenseCategories
    : DEFAULT_LOOKUPS.expenseCategories;

  const isDurationArray = (v: unknown): v is ProcedureDuration[] =>
    Array.isArray(v) && v.every((o) =>
      o && typeof o === "object" &&
      typeof (o as any).id === "string" &&
      typeof (o as any).label === "string" &&
      typeof (o as any).days === "number" && Number.isFinite((o as any).days) && (o as any).days > 0,
    );

  const procedureDurations = isDurationArray(src.procedureDurations) && src.procedureDurations.length > 0
    ? src.procedureDurations
    : DEFAULT_LOOKUPS.procedureDurations;

  return { caseTypes, documentTypes, expenseCategories, procedureDurations };
}

let state: OfficeLookups = DEFAULT_LOOKUPS;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): OfficeLookups {
  return state;
}

/** يحمّل قوائم المكتب مرة واحدة لكل مكتب */
export async function loadOfficeLookups(lawyerId: string | null): Promise<void> {
  if (!lawyerId || lawyerId === "ALL" || loadedFor === lawyerId) return;
  loadedFor = lawyerId;
  try {
    const snap = await getDoc(doc(db, "office_settings", lawyerId));
    state = snap.exists() ? sanitize(snap.data()?.lookups) : DEFAULT_LOOKUPS;
    emit();
  } catch (err) {
    console.error("تعذّر تحميل قوائم المكتب:", err);
    loadedFor = null;
  }
}

/** يحفظ القوائم ويحدّث المخزن فوراً */
export async function saveOfficeLookups(lawyerId: string, lookups: OfficeLookups): Promise<void> {
  const clean = sanitize(lookups);
  await setDoc(
    doc(db, "office_settings", lawyerId),
    { lawyerId, lookups: clean, updatedAt: new Date().toISOString() },
    { merge: true },
  );
  state = clean;
  emit();
}

/** Hook للاشتراك في قوائم المكتب الحالية */
export function useOfficeLookups(): OfficeLookups {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Hook يضمن تحميل القوائم مرة واحدة */
export function useLoadOfficeLookups(lawyerId: string | null): () => void {
  return useCallback(() => {
    void loadOfficeLookups(lawyerId);
  }, [lawyerId]);
}
