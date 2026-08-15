/**
 * إعدادات المكتب المحفوظة في Firestore — تبدأ بتجاوزات الصلاحيات.
 *
 * لماذا Firestore لا localStorage؟ لأن الصلاحيات قرار مكتب لا قرار متصفح:
 * يجب أن تُطبَّق على كل مستخدمي المكتب وعلى كل أجهزتهم.
 *
 * التجاوزات **محدودة عمداً** بقائمة OVERRIDABLE أدناه، حتى لا يستطيع أحد
 * منح دور صلاحية خطيرة (مثل الإعدادات أو إدارة المستخدمين) بالخطأ.
 */

import { useCallback, useSyncExternalStore } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Role } from "./roles";
import { setOverrideResolver, type Permission, type Scope } from "./permissions";

export type PermissionOverrides = Partial<Record<Role, Partial<Record<Permission, Scope>>>>;

export interface OfficeSettings {
  permissionOverrides: PermissionOverrides;
  /** رابط صورة ختم المكتب الرسمي — يُطبع على المذكرات بعد اعتمادها نهائياً */
  officialStampUrl: string | null;
}

/** تجاوز واحد مسموح — يُعرض كمفتاح في شاشة الإعدادات */
export interface OverridableToggle {
  id: string;
  role: Role;
  permission: Permission;
  label: string;
  description: string;
  /** الدرجة عند تشغيل المفتاح */
  onScope: Scope;
  /** الدرجة عند إطفائه — وهي قيمة المصفوفة الافتراضية */
  offScope: Scope;
  /** حالة المفتاح افتراضياً */
  defaultOn: boolean;
}

/**
 * القائمة البيضاء للتجاوزات المسموحة.
 * أي (دور، صلاحية) خارج هذه القائمة لا يمكن تجاوزه إطلاقاً.
 */
export const OVERRIDABLE: OverridableToggle[] = [
  {
    id: "trainee-finance",
    role: "TRAINEE",
    permission: "finance.manage",
    label: "عرض الماليات للمتدربين",
    description: "إظهار الأتعاب والمصروفات لحسابات المتدربين",
    onScope: "VIEW",
    offScope: "NONE",
    defaultOn: false,
  },
  {
    id: "trainee-case-create",
    role: "TRAINEE",
    permission: "case.create",
    label: "السماح للمتدربين بإنشاء قضايا",
    description: "ينشئ المتدرب ملف قضية أولياً (مسودة) يحتاج اعتماد مدير المكتب",
    onScope: "DRAFT",
    offScope: "NONE",
    defaultOn: true,
  },
  {
    id: "trainee-doc-delete",
    role: "TRAINEE",
    permission: "document.manage",
    label: "السماح للمتدربين بحذف المستندات",
    description: "افتراضياً المتدرب يرفع المستندات ولا يحذفها",
    onScope: "YES",
    offScope: "UPLOAD_ONLY",
    defaultOn: false,
  },
  {
    id: "secretary-finance",
    role: "SECRETARY",
    permission: "finance.manage",
    label: "عرض الماليات للسكرتارية",
    description: "الوثيقة تمنع السكرتارية من الاطلاع على البيانات المالية افتراضياً",
    onScope: "VIEW",
    offScope: "NONE",
    defaultOn: false,
  },
  {
    id: "officelawyer-finance",
    role: "OFFICE_LAWYER",
    permission: "finance.manage",
    label: "عرض الماليات لمحامي المكتب",
    description: "إظهار حسابات المكتب لمحامي المكتب — مغلق افتراضياً لفصل المالي عن القانوني",
    onScope: "VIEW",
    offScope: "NONE",
    defaultOn: false,
  },
  {
    id: "officelawyer-memo-approval",
    role: "OFFICE_LAWYER",
    permission: "memo.manage",
    label: "إلزام محامي المكتب بدورة اعتماد قبل رفع المذكرات",
    description: "عند التفعيل، يجب أن تمر مذكرات/لوائح محامي المكتب بمراجعة المستشار ثم اعتماد الشريك أو صاحب المكتب قبل رفعها للجلسة. عند الإطفاء (الافتراضي) يرفعها المحامي مباشرة بلا مراجعة.",
    onScope: "CREATE",
    offScope: "FULL",
    defaultOn: false,
  },
];

// ===== مخزن بسيط قابل للاشتراك (بلا Context Provider) =====

let state: OfficeSettings = { permissionOverrides: {}, officialStampUrl: null };
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): OfficeSettings {
  return state;
}

/** التجاوزات الحالية — تُستخدم من طبقة الصلاحيات */
export function getPermissionOverrides(): PermissionOverrides {
  return state.permissionOverrides;
}

// نُوصّل التجاوزات بطبقة الصلاحيات فور تحميل هذا الملف
setOverrideResolver((role, permission) => state.permissionOverrides[role]?.[permission]);

/** حوّل حالة المفاتيح إلى خريطة تجاوزات */
export function togglesToOverrides(on: Record<string, boolean>): PermissionOverrides {
  const out: PermissionOverrides = {};
  for (const t of OVERRIDABLE) {
    const isOn = on[t.id] ?? t.defaultOn;
    // لا نكتب تجاوزاً إن كانت النتيجة هي قيمة المصفوفة الافتراضية أصلاً
    const scope = isOn ? t.onScope : t.offScope;
    if (isOn === t.defaultOn) continue;
    out[t.role] = { ...(out[t.role] ?? {}), [t.permission]: scope };
  }
  return out;
}

/** استخرج حالة المفاتيح من خريطة التجاوزات المحفوظة */
export function overridesToToggles(overrides: PermissionOverrides): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of OVERRIDABLE) {
    const saved = overrides[t.role]?.[t.permission];
    out[t.id] = saved === undefined ? t.defaultOn : saved === t.onScope;
  }
  return out;
}

/** يُنقّي أي تجاوز خارج القائمة البيضاء — دفاع ضد بيانات محقونة */
function sanitize(raw: unknown): PermissionOverrides {
  const out: PermissionOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  const map = raw as PermissionOverrides;

  for (const t of OVERRIDABLE) {
    const value = map[t.role]?.[t.permission];
    if (value === t.onScope || value === t.offScope) {
      out[t.role] = { ...(out[t.role] ?? {}), [t.permission]: value };
    }
  }
  return out;
}

/** ينقّي رابط ختم المكتب — نص غير فارغ فقط، وإلا يُهمَل */
function sanitizeStampUrl(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** يحمّل إعدادات المكتب مرة واحدة لكل مكتب */
export async function loadOfficeSettings(lawyerId: string | null): Promise<void> {
  if (!lawyerId || lawyerId === "ALL" || loadedFor === lawyerId) return;
  loadedFor = lawyerId;
  try {
    const snap = await getDoc(doc(db, "office_settings", lawyerId));
    state = {
      permissionOverrides: snap.exists() ? sanitize(snap.data()?.permissionOverrides) : {},
      officialStampUrl: snap.exists() ? sanitizeStampUrl(snap.data()?.officialStampUrl) : null,
    };
    emit();
  } catch (err) {
    // الفشل يعني الرجوع للمصفوفة الافتراضية — وهي الأكثر تحفظاً
    console.error("تعذّر تحميل إعدادات المكتب:", err);
    loadedFor = null;
  }
}

/** يحفظ التجاوزات ويحدّث المخزن فوراً */
export async function savePermissionOverrides(
  lawyerId: string,
  overrides: PermissionOverrides,
  userId: string | null,
): Promise<void> {
  const clean = sanitize(overrides);
  await setDoc(
    doc(db, "office_settings", lawyerId),
    {
      lawyerId,
      permissionOverrides: clean,
      updatedAt: new Date().toISOString(),
      updatedBy: userId ?? null,
    },
    { merge: true },
  );
  state = { ...state, permissionOverrides: clean };
  emit();
}

/** يحفظ رابط ختم المكتب الرسمي ويحدّث المخزن فوراً */
export async function saveOfficialStamp(
  lawyerId: string,
  stampUrl: string | null,
  userId: string | null,
): Promise<void> {
  await setDoc(
    doc(db, "office_settings", lawyerId),
    {
      lawyerId,
      officialStampUrl: stampUrl,
      updatedAt: new Date().toISOString(),
      updatedBy: userId ?? null,
    },
    { merge: true },
  );
  state = { ...state, officialStampUrl: stampUrl };
  emit();
}

/** Hook للاشتراك في إعدادات المكتب */
export function useOfficeSettings(): OfficeSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Hook يضمن تحميل الإعدادات مرة واحدة */
export function useLoadOfficeSettings(lawyerId: string | null): () => void {
  return useCallback(() => {
    void loadOfficeSettings(lawyerId);
  }, [lawyerId]);
}
