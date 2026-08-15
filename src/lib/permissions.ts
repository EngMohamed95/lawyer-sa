/**
 * مصفوفة الصلاحيات — المصدر الوحيد للحقيقة.
 *
 * منقولة حرفياً من "نظام_إدارة_مكتب_محاماة.docx" — القسم ثالثاً.
 * يُستورد هذا الملف في الواجهة وفي الخادم معاً، فلا تُكرَّر المصفوفة في مكانين.
 *
 * ⚠️ الواجهة تستخدمها لإخفاء الأزرار فقط — الحماية الفعلية على الخادم
 *    وفي قواعد Firestore. إخفاء الزر ليس حماية.
 */

import { ROLES, type Role } from "./roles";

/** درجات الوصول كما وردت في الوثيقة */
export type Scope =
  | "FULL"          // كامل
  | "YES"           // نعم
  | "ASSIGNED"      // المكلف بها
  | "LIMITED"       // محدود
  | "DRAFT"         // أولي — ينشئ مسودة تحتاج اعتماد
  | "UPLOAD_ONLY"   // رفع فقط
  | "SHARED_ONLY"   // المسموح فقط
  | "APPROVE"       // اعتماد
  | "CREATE"        // إنشاء
  | "REVIEW"        // مراجعة
  | "VIEW"          // عرض فقط
  | "PAY"           // دفع
  | "OWN"           // الخاصة به
  | "FINANCIAL"     // مالية
  | "NONE";         // لا

/** ما الذي تسمح به كل درجة وصول — جدول صريح بدل شروط متناثرة */
interface Capabilities {
  view: boolean;
  create: boolean;
  update: boolean;
  remove: boolean;
  approve: boolean;
  /** مقيّد بالسجلات المسنَدة للمستخدم */
  assignedOnly: boolean;
  /** تعديل الحقول الإدارية فقط */
  fieldLimited: boolean;
  /** ينشئ مسودة تحتاج اعتماداً */
  draftOnly: boolean;
  /** يرفع ولا يقرأ المصنّف سرياً */
  uploadOnly: boolean;
  /** يرى المشارَك معه فقط */
  sharedOnly: boolean;
  /** يرى بياناته هو فقط */
  ownOnly: boolean;
}

const C = (o: Partial<Capabilities>): Capabilities => ({
  view: false, create: false, update: false, remove: false, approve: false,
  assignedOnly: false, fieldLimited: false, draftOnly: false,
  uploadOnly: false, sharedOnly: false, ownOnly: false,
  ...o,
});

export const SCOPE_CAPABILITIES: Record<Scope, Capabilities> = {
  FULL:        C({ view: true, create: true, update: true, remove: true, approve: true }),
  YES:         C({ view: true, create: true, update: true, remove: true }),
  ASSIGNED:    C({ view: true, create: true, update: true, assignedOnly: true }),
  LIMITED:     C({ view: true, update: true, fieldLimited: true }),
  DRAFT:       C({ view: true, create: true, draftOnly: true }),
  UPLOAD_ONLY: C({ view: true, create: true, uploadOnly: true }),
  SHARED_ONLY: C({ view: true, sharedOnly: true }),
  APPROVE:     C({ view: true, update: true, approve: true }),
  CREATE:      C({ view: true, create: true, update: true }),
  REVIEW:      C({ view: true, update: true }),
  VIEW:        C({ view: true }),
  PAY:         C({ view: true, update: true }),
  OWN:         C({ view: true, ownOnly: true }),
  FINANCIAL:   C({ view: true }),
  NONE:        C({}),
};

/** مفاتيح الصلاحيات */
export type Permission =
  // ===== الصفوف العشرة الواردة نصاً في الوثيقة =====
  | "users.manage"
  | "case.create"
  | "case.update"
  | "case.delete"
  | "hearing.manage"
  | "document.manage"
  | "contract.manage"
  | "invoice.manage"
  | "report.view"
  | "settings.manage"
  // ===== صلاحيات تشغيلية يحتاجها النظام القائم =====
  | "memo.manage"
  | "client.manage"
  | "task.manage"
  | "finance.manage"
  | "trainee.manage"
  | "officelawyer.manage"
  | "consultant.manage"
  | "library.view"
  | "ai.use"
  | "audit.view"
  | "recyclebin.manage"
  | "platform.manage"
  | "appointment.manage";

type Matrix = Record<Permission, Record<Role, Scope>>;

/**
 * ملاحظة مهمة على SUPER_ADMIN:
 * في النظام القائم لا يرى مدير المنصة وحدات المكتب إطلاقاً (يرى المحامين
 * والاشتراكات فقط) — راجع App.tsx. أبقينا هذا السلوك تماماً كما هو،
 * فقيمته NONE في وحدات المكتب و FULL في إدارة المنصة والتدقيق.
 */
export const PERMISSION_MATRIX: Matrix = {
  // ── الوثيقة §ثالثاً ──────────────────────────────────────────────────
  "users.manage": {
    LAWYER: "FULL", PARTNER: "NONE", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "case.create": {
    LAWYER: "YES", PARTNER: "YES", OFFICE_LAWYER: "YES", CONSULTANT: "NONE",
    SECRETARY: "DRAFT", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "DRAFT",
    SUPER_ADMIN: "NONE",
  },
  "case.update": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "ASSIGNED", CONSULTANT: "ASSIGNED",
    SECRETARY: "LIMITED", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "ASSIGNED",
    SUPER_ADMIN: "NONE",
  },
  "case.delete": {
    LAWYER: "YES", PARTNER: "NONE", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "hearing.manage": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "YES", CONSULTANT: "YES",
    SECRETARY: "YES", ACCOUNTANT: "NONE", CLIENT: "VIEW", TRAINEE: "ASSIGNED",
    SUPER_ADMIN: "NONE",
  },
  "document.manage": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "YES", CONSULTANT: "YES",
    SECRETARY: "UPLOAD_ONLY", ACCOUNTANT: "NONE", CLIENT: "SHARED_ONLY",
    TRAINEE: "UPLOAD_ONLY", SUPER_ADMIN: "NONE",
  },
  "contract.manage": {
    LAWYER: "FULL", PARTNER: "APPROVE", OFFICE_LAWYER: "CREATE", CONSULTANT: "REVIEW",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "VIEW", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "invoice.manage": {
    LAWYER: "FULL", PARTNER: "APPROVE", OFFICE_LAWYER: "VIEW", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "FULL", CLIENT: "PAY", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "report.view": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "OWN", CONSULTANT: "OWN",
    SECRETARY: "LIMITED", ACCOUNTANT: "FINANCIAL", CLIENT: "OWN", TRAINEE: "OWN",
    SUPER_ADMIN: "NONE",
  },
  "settings.manage": {
    LAWYER: "FULL", PARTNER: "NONE", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "FULL",
  },

  // ── صلاحيات تشغيلية (مشتقة من روح الوثيقة) ──────────────────────────
  // المذكرات والصحف (لائحة الادعاء/الرد): محامي المكتب "كامل" افتراضياً
  // (رفع مباشر)، وقابل للتحويل إلى "إنشاء" عبر إعدادات المكتب بحيث تمر
  // مذكراته بمراجعة المستشار واعتماد الشريك/المكتب قبل رفعها — راجع
  // officeSettings.ts (OVERRIDABLE: officelawyer-memo-approval).
  "memo.manage": {
    LAWYER: "FULL", PARTNER: "APPROVE", OFFICE_LAWYER: "FULL", CONSULTANT: "REVIEW",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "VIEW", TRAINEE: "DRAFT",
    SUPER_ADMIN: "NONE",
  },
  "client.manage": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "ASSIGNED", CONSULTANT: "ASSIGNED",
    SECRETARY: "YES", ACCOUNTANT: "VIEW", CLIENT: "NONE", TRAINEE: "ASSIGNED",
    SUPER_ADMIN: "NONE",
  },
  "task.manage": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "ASSIGNED", CONSULTANT: "ASSIGNED",
    SECRETARY: "YES", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "ASSIGNED",
    SUPER_ADMIN: "NONE",
  },
  // فصل الصلاحيات المالية عن القانونية — الوثيقة §خامساً
  "finance.manage": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "FULL", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "trainee.manage": {
    LAWYER: "FULL", PARTNER: "VIEW", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "officelawyer.manage": {
    LAWYER: "FULL", PARTNER: "VIEW", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "consultant.manage": {
    LAWYER: "FULL", PARTNER: "VIEW", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "NONE",
  },
  "library.view": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "FULL", CONSULTANT: "FULL",
    SECRETARY: "VIEW", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "FULL",
    SUPER_ADMIN: "NONE",
  },
  "ai.use": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "FULL", CONSULTANT: "FULL",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "FULL",
    SUPER_ADMIN: "NONE",
  },
  "audit.view": {
    LAWYER: "FULL", PARTNER: "VIEW", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "FULL",
  },
  "recyclebin.manage": {
    LAWYER: "FULL", PARTNER: "NONE", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "FULL",
  },
  "platform.manage": {
    LAWYER: "NONE", PARTNER: "NONE", OFFICE_LAWYER: "NONE", CONSULTANT: "NONE",
    SECRETARY: "NONE", ACCOUNTANT: "NONE", CLIENT: "NONE", TRAINEE: "NONE",
    SUPER_ADMIN: "FULL",
  },
  // الوثيقة §1.8 و§2.5: السكرتارية تجدول بالكامل، والمحاسب محجوب عن المواعيد،
  // والعميل يرى مواعيده هو فقط.
  "appointment.manage": {
    LAWYER: "FULL", PARTNER: "FULL", OFFICE_LAWYER: "ASSIGNED", CONSULTANT: "ASSIGNED",
    SECRETARY: "FULL", ACCOUNTANT: "NONE", CLIENT: "OWN", TRAINEE: "ASSIGNED",
    SUPER_ADMIN: "NONE",
  },
};

/** سياق السجل — لازم لتفسير "المكلف بها" و"المسموح فقط" و"الخاصة به" */
export interface AccessContext {
  /** معرّف المستخدم الحالي */
  userId?: string | null;
  /** المحامي المسؤول عن السجل */
  assignedTo?: string | null;
  /** فريق العمل على السجل */
  teamIds?: string[] | null;
  /** منشئ السجل */
  createdBy?: string | null;
  /** هل المستند مشارَك مع العميل */
  sharedWithClient?: boolean;
}

/**
 * تجاوزات المكتب — تُحقن من officeSettings حتى لا يعتمد هذا الملف عليه
 * (فلولا ذلك لنشأت دورة استيراد بين الملفين).
 */
type OverrideResolver = (role: Role, permission: Permission) => Scope | undefined;
let overrideResolver: OverrideResolver = () => undefined;

export function setOverrideResolver(resolver: OverrideResolver): void {
  overrideResolver = resolver;
}

/** درجة وصول الدور لهذه الصلاحية، بعد تطبيق تجاوزات المكتب إن وُجدت */
export function scopeOf(role: Role, permission: Permission): Scope {
  return overrideResolver(role, permission) ?? PERMISSION_MATRIX[permission]?.[role] ?? "NONE";
}

/** درجة الوصول الافتراضية من الوثيقة، متجاهلةً أي تجاوز */
export function defaultScopeOf(role: Role, permission: Permission): Scope {
  return PERMISSION_MATRIX[permission]?.[role] ?? "NONE";
}

/** قدرات الدور المفصّلة لهذه الصلاحية */
export function capabilitiesOf(role: Role, permission: Permission): Capabilities {
  return SCOPE_CAPABILITIES[scopeOf(role, permission)];
}

/** هل يملك الدور أي وصول لهذه الصلاحية؟ (تُستخدم لإظهار/إخفاء الصفحات) */
export function can(role: Role, permission: Permission): boolean {
  return scopeOf(role, permission) !== "NONE";
}

/** هل السجل ضمن نطاق المستخدم؟ يفسّر "المكلف بها" و"الخاصة به" و"المسموح فقط" */
function inScope(caps: Capabilities, ctx?: AccessContext): boolean {
  if (!ctx) return !(caps.assignedOnly || caps.ownOnly || caps.sharedOnly);

  if (caps.sharedOnly) return ctx.sharedWithClient === true;

  if (caps.assignedOnly || caps.ownOnly) {
    const uid = ctx.userId ?? null;
    if (!uid) return false;
    return (
      ctx.assignedTo === uid ||
      ctx.createdBy === uid ||
      (ctx.teamIds?.includes(uid) ?? false)
    );
  }
  return true;
}

export function canView(role: Role, permission: Permission, ctx?: AccessContext): boolean {
  const caps = capabilitiesOf(role, permission);
  return caps.view && inScope(caps, ctx);
}

export function canCreate(role: Role, permission: Permission): boolean {
  return capabilitiesOf(role, permission).create;
}

export function canUpdate(role: Role, permission: Permission, ctx?: AccessContext): boolean {
  const caps = capabilitiesOf(role, permission);
  return caps.update && inScope(caps, ctx);
}

export function canDelete(role: Role, permission: Permission, ctx?: AccessContext): boolean {
  const caps = capabilitiesOf(role, permission);
  return caps.remove && inScope(caps, ctx);
}

export function canApprove(role: Role, permission: Permission): boolean {
  return capabilitiesOf(role, permission).approve;
}

/** هل ما ينشئه هذا الدور مسودة تحتاج اعتماداً؟ (السكرتارية والمتدرب: "أولي") */
export function createsDraftOnly(role: Role, permission: Permission): boolean {
  return capabilitiesOf(role, permission).draftOnly;
}

/** هل هذا الدور مقيّد بالحقول الإدارية فقط؟ (السكرتارية: "محدود") */
export function isFieldLimited(role: Role, permission: Permission): boolean {
  return capabilitiesOf(role, permission).fieldLimited;
}

/** هل هذا الدور يرفع المستندات ولا يقرأ السري منها؟ */
export function isUploadOnly(role: Role, permission: Permission): boolean {
  return capabilitiesOf(role, permission).uploadOnly;
}

/** هل يرى بياناته هو فقط؟ (التقارير: "الخاصة به") */
export function isOwnOnly(role: Role, permission: Permission): boolean {
  return capabilitiesOf(role, permission).ownOnly;
}

/** التسمية العربية لدرجة الوصول — تُعرض في شاشة مصفوفة الصلاحيات */
export const SCOPE_LABELS_AR: Record<Scope, string> = {
  FULL: "كامل",
  YES: "نعم",
  ASSIGNED: "المكلف بها",
  LIMITED: "محدود",
  DRAFT: "أولي",
  UPLOAD_ONLY: "رفع فقط",
  SHARED_ONLY: "المسموح فقط",
  APPROVE: "اعتماد",
  CREATE: "إنشاء",
  REVIEW: "مراجعة",
  VIEW: "عرض",
  PAY: "دفع",
  OWN: "الخاصة به",
  FINANCIAL: "مالية",
  NONE: "لا",
};

/** التسمية العربية لكل صلاحية — تُعرض في شاشة مصفوفة الصلاحيات */
export const PERMISSION_LABELS_AR: Record<Permission, string> = {
  "users.manage": "إدارة المستخدمين",
  "case.create": "إنشاء قضية",
  "case.update": "تعديل القضية",
  "case.delete": "حذف قضية",
  "hearing.manage": "إدارة الجلسات",
  "document.manage": "إدارة المستندات",
  "contract.manage": "العقود",
  "invoice.manage": "الفواتير",
  "report.view": "التقارير",
  "settings.manage": "الإعدادات",
  "memo.manage": "المذكرات واللوائح",
  "client.manage": "إدارة العملاء",
  "task.manage": "إدارة المهام",
  "finance.manage": "الحسابات والمالية",
  "trainee.manage": "إدارة المتدربين",
  "officelawyer.manage": "إدارة محامي المكتب",
  "consultant.manage": "إدارة المستشارين",
  "library.view": "المكتبة القانونية",
  "ai.use": "المساعد الذكي",
  "audit.view": "سجل التدقيق",
  "recyclebin.manage": "سلة المحذوفات",
  "platform.manage": "إدارة المنصة",
  "appointment.manage": "المواعيد والتقويم",
};

/** الصلاحيات العشر الواردة نصاً في الوثيقة — تُعرض أولاً في جدول المصفوفة */
export const DOCUMENT_PERMISSIONS: Permission[] = [
  "users.manage", "case.create", "case.update", "case.delete",
  "hearing.manage", "document.manage", "contract.manage",
  "invoice.manage", "report.view", "settings.manage",
];

/** الأدوار السبعة الواردة في الوثيقة — أعمدة جدول المصفوفة */
export const DOCUMENT_ROLES: Role[] = [
  ROLES.LAWYER, ROLES.PARTNER, ROLES.OFFICE_LAWYER, ROLES.CONSULTANT,
  ROLES.SECRETARY, ROLES.ACCOUNTANT, ROLES.CLIENT,
];
