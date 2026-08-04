/**
 * نموذج الأدوار — المصدر الوحيد لأسماء الأدوار في النظام.
 *
 * مهم: القيم الأربع القائمة (SUPER_ADMIN, LAWYER, OFFICE_LAWYER, TRAINEE)
 * لم تتغيّر ولن تتغيّر — كل البيانات الموجودة في Firestore تستخدمها.
 * الأدوار الخمسة الجديدة أُضيفت بجوارها فقط.
 */

export const ROLES = {
  /** مدير المنصة (SaaS) — خارج وثيقة المتطلبات، يدير حسابات المكاتب */
  SUPER_ADMIN: "SUPER_ADMIN",
  /** مدير المكتب = العميل المشترك. الوثيقة §2.1 */
  LAWYER: "LAWYER",
  /** الشريك. الوثيقة §2.2 */
  PARTNER: "PARTNER",
  /** المحامي. الوثيقة §2.3 */
  OFFICE_LAWYER: "OFFICE_LAWYER",
  /** المستشار القانوني. الوثيقة §2.4 */
  CONSULTANT: "CONSULTANT",
  /** السكرتارية. الوثيقة §2.5 */
  SECRETARY: "SECRETARY",
  /** المحاسب. الوثيقة §2.6 */
  ACCOUNTANT: "ACCOUNTANT",
  /** المتدرب — خارج الوثيقة، قائم في النظام */
  TRAINEE: "TRAINEE",
  /** العميل عبر بوابة العميل. الوثيقة §2.7 */
  CLIENT: "CLIENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

/** التسميات العربية المعروضة في الواجهة */
export const ROLE_LABELS_AR: Record<Role, string> = {
  SUPER_ADMIN: "مدير المنصة",
  LAWYER: "مدير المكتب",
  PARTNER: "شريك",
  OFFICE_LAWYER: "محامي",
  CONSULTANT: "مستشار قانوني",
  SECRETARY: "سكرتارية",
  ACCOUNTANT: "محاسب",
  TRAINEE: "متدرب",
  CLIENT: "عميل",
};

/** وصف مختصر لكل دور — يُعرض في شاشات إنشاء المستخدمين */
export const ROLE_DESCRIPTIONS_AR: Record<Role, string> = {
  SUPER_ADMIN: "يدير حسابات المكاتب والاشتراكات على مستوى المنصة",
  LAWYER: "صاحب المكتب — صلاحيات كاملة على كل شيء داخل مكتبه",
  PARTNER: "يطّلع على كل القضايا ويعتمد العقود والفواتير والمذكرات",
  OFFICE_LAWYER: "يعمل على القضايا المكلّف بها فقط",
  CONSULTANT: "يراجع المذكرات والعقود ويضيف الرأي القانوني",
  SECRETARY: "تسجيل العملاء وجدولة الجلسات ورفع المستندات — بلا وصول مالي",
  ACCOUNTANT: "الفواتير والسندات والتقارير المالية — بلا وصول لمحتوى القضايا",
  TRAINEE: "يعمل تحت إشراف محامٍ على المهام المسنَدة إليه",
  CLIENT: "يتابع قضاياه ومستنداته وفواتيره عبر بوابة العميل",
};

/** لون الشارة لكل دور */
export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
  LAWYER: "bg-[#133B2E]/10 text-[#133B2E] border-[#133B2E]/20",
  PARTNER: "bg-amber-100 text-amber-800 border-amber-200",
  OFFICE_LAWYER: "bg-blue-100 text-blue-800 border-blue-200",
  CONSULTANT: "bg-indigo-100 text-indigo-800 border-indigo-200",
  SECRETARY: "bg-teal-100 text-teal-800 border-teal-200",
  ACCOUNTANT: "bg-emerald-100 text-emerald-800 border-emerald-200",
  TRAINEE: "bg-gray-100 text-gray-700 border-gray-200",
  CLIENT: "bg-rose-100 text-rose-800 border-rose-200",
};

/**
 * الأدوار التي يستطيع مدير المكتب إنشاؤها داخل مكتبه.
 * لا يستطيع إنشاء SUPER_ADMIN ولا LAWYER آخر.
 */
export const ROLES_CREATABLE_BY_OFFICE: Role[] = [
  ROLES.PARTNER,
  ROLES.OFFICE_LAWYER,
  ROLES.CONSULTANT,
  ROLES.SECRETARY,
  ROLES.ACCOUNTANT,
  ROLES.TRAINEE,
  ROLES.CLIENT,
];

/** الأدوار التي تعمل داخل مكتب (يقابلها SUPER_ADMIN الذي يعمل عبر المكاتب) */
export const OFFICE_SCOPED_ROLES: Role[] = [
  ROLES.LAWYER,
  ...ROLES_CREATABLE_BY_OFFICE,
];

/** هل هذه القيمة دور معروف؟ يحمي من بيانات قديمة أو تالفة */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value);
}

/**
 * يقرأ الدور بأمان مع قيمة افتراضية آمنة (أقل صلاحية).
 * أي قيمة غير معروفة تُعامل كـ TRAINEE — مبدأ أقل صلاحية.
 */
export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : ROLES.TRAINEE;
}

/** التسمية العربية لأي قيمة، حتى لو غير معروفة */
export function roleLabel(value: unknown): string {
  return isRole(value) ? ROLE_LABELS_AR[value] : "غير محدد";
}
