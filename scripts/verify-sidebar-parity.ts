/**
 * اختبار عدم التراجع للقائمة الجانبية.
 *
 * يقارن المنطق القديم (الشروط المكتوبة يدوياً في App.tsx قبل الميزة 002)
 * بالمنطق الجديد المشتق من مصفوفة الصلاحيات، لكل تركيبة دور × باقة.
 * أي اختلاف للأدوار الأربعة القائمة يعني أننا كسرنا سلوكاً قائماً.
 *
 * التشغيل:  npx tsx scripts/verify-sidebar-parity.ts
 */

import { can, scopeOf } from "../src/lib/permissions";
import { normalizeRole } from "../src/lib/roles";

const EXISTING_ROLES = ["SUPER_ADMIN", "LAWYER", "OFFICE_LAWYER", "TRAINEE"];
const NEW_ROLES = ["PARTNER", "CONSULTANT", "SECRETARY", "ACCOUNTANT", "CLIENT"];
const PLANS = ["BASIC", "PRO", "PREMIUM"];

const ITEMS = [
  "لوحة التحكم", "المحامين", "الاشتراكات", "العملاء", "القضايا", "الجلسات",
  "المهام", "المستندات", "الحسابات", "المتدربين", "محامو المكتب", "التقارير",
  "المساعد الذكي", "المكتبة القانونية",
] as const;

type Item = (typeof ITEMS)[number];

/** المنطق القديم — منسوخ حرفياً من App.tsx قبل التعديل */
function oldHidden(item: Item, userRole: string, plan: string): boolean {
  switch (item) {
    case "لوحة التحكم":       return false;
    case "المحامين":          return userRole !== "SUPER_ADMIN";
    case "الاشتراكات":        return userRole !== "SUPER_ADMIN";
    case "العملاء":          return userRole === "SUPER_ADMIN";
    case "القضايا":           return userRole === "SUPER_ADMIN";
    case "الجلسات":           return userRole === "SUPER_ADMIN";
    case "المهام":            return userRole === "SUPER_ADMIN" || ((userRole === "LAWYER" || userRole === "OFFICE_LAWYER") && plan === "BASIC");
    case "المستندات":         return userRole === "SUPER_ADMIN" || ((userRole === "LAWYER" || userRole === "OFFICE_LAWYER") && plan === "BASIC");
    case "الحسابات":          return userRole === "TRAINEE" || userRole === "OFFICE_LAWYER" || userRole === "SUPER_ADMIN" || (userRole === "LAWYER" && plan === "BASIC");
    case "المتدربين":         return userRole !== "LAWYER" || plan === "BASIC";
    case "محامو المكتب":      return userRole !== "LAWYER" || plan === "BASIC";
    case "التقارير":          return userRole === "TRAINEE" || userRole === "OFFICE_LAWYER" || userRole === "SUPER_ADMIN" || (userRole === "LAWYER" && plan !== "PREMIUM");
    case "المساعد الذكي":     return userRole === "SUPER_ADMIN" || plan !== "PREMIUM";
    case "المكتبة القانونية": return userRole === "SUPER_ADMIN";
  }
}

/** المنطق الجديد — منسوخ حرفياً من App.tsx بعد التعديل */
function newHidden(item: Item, userRole: string, plan: string): boolean {
  const role = normalizeRole(userRole);
  const isBasic = plan === "BASIC";
  const isPremium = plan === "PREMIUM";
  const canSeeFullReports = scopeOf(role, "report.view") === "FULL";
  const paidRoleOnBasic = isBasic && (role === "LAWYER" || role === "OFFICE_LAWYER");

  switch (item) {
    case "لوحة التحكم":       return false;
    case "المحامين":          return !can(role, "platform.manage");
    case "الاشتراكات":        return !can(role, "platform.manage");
    case "العملاء":          return !can(role, "client.manage");
    case "القضايا":           return !can(role, "case.update");
    case "الجلسات":           return !can(role, "hearing.manage");
    case "المهام":            return !can(role, "task.manage") || paidRoleOnBasic;
    case "المستندات":         return !can(role, "document.manage") || paidRoleOnBasic;
    case "الحسابات":          return !can(role, "finance.manage") || isBasic;
    case "المتدربين":         return !can(role, "trainee.manage") || isBasic;
    case "محامو المكتب":      return !can(role, "officelawyer.manage") || isBasic;
    case "التقارير":          return !canSeeFullReports || !isPremium;
    case "المساعد الذكي":     return !can(role, "ai.use") || !isPremium;
    case "المكتبة القانونية": return !can(role, "library.view");
  }
}

let checks = 0;
const diffs: string[] = [];

for (const role of EXISTING_ROLES) {
  for (const plan of PLANS) {
    for (const item of ITEMS) {
      checks++;
      const o = oldHidden(item, role, plan);
      const n = newHidden(item, role, plan);
      if (o !== n) {
        diffs.push(`${role} / ${plan} / ${item}: قديم=${o ? "مخفي" : "ظاهر"} ← جديد=${n ? "مخفي" : "ظاهر"}`);
      }
    }
  }
}

console.log(`فُحصت ${checks} حالة (${EXISTING_ROLES.length} أدوار قائمة × ${PLANS.length} باقات × ${ITEMS.length} عنصر)\n`);

if (diffs.length === 0) {
  console.log("✅ تطابق تام — لم يتغيّر أي سلوك للأدوار القائمة");
} else {
  console.log(`❌ ${diffs.length} اختلاف:`);
  diffs.forEach((d) => console.log("   " + d));
}

console.log("\n--- ما تراه الأدوار الجديدة (باقة PREMIUM) ---");
for (const role of NEW_ROLES) {
  const visible = ITEMS.filter((i) => !newHidden(i, role, "PREMIUM"));
  console.log(`${role.padEnd(14)}: ${visible.length ? visible.join(" · ") : "(لا شيء — يحتاج بوابة العميل)"}`);
}

process.exit(diffs.length === 0 ? 0 : 1);
