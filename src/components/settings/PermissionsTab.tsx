/**
 * تبويب الصلاحيات — كان صورة HTML ثابتة بمفاتيح لا تعمل ولا تُحفظ.
 *
 * الآن:
 *  1. مفاتيح حقيقية تُحفظ في Firestore وتؤثر فعلاً في سلوك النظام.
 *  2. جدول مصفوفة الصلاحيات كما وردت في وثيقة المتطلبات، ويُظهر أي تجاوز.
 */

import { useEffect, useState } from "react";
import { Shield, Check, AlertCircle, RotateCcw, Save, Info } from "lucide-react";
import {
  OVERRIDABLE,
  overridesToToggles,
  savePermissionOverrides,
  togglesToOverrides,
  useOfficeSettings,
} from "../../lib/officeSettings";
import {
  DOCUMENT_PERMISSIONS,
  DOCUMENT_ROLES,
  PERMISSION_LABELS_AR,
  SCOPE_LABELS_AR,
  defaultScopeOf,
  scopeOf,
} from "../../lib/permissions";
import { ROLE_LABELS_AR } from "../../lib/roles";
import { usePermissions } from "../../lib/usePermissions";
import { writeAudit } from "../../lib/audit";

export default function PermissionsTab() {
  const perms = usePermissions();
  const office = useOfficeSettings();

  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    overridesToToggles(office.permissionOverrides),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // نُزامن الحالة المحلية كلما تغيّرت الإعدادات المحمّلة من Firestore
  useEffect(() => {
    setToggles(overridesToToggles(office.permissionOverrides));
  }, [office]);

  const canManage = perms.can("settings.manage");
  const baseline = overridesToToggles(office.permissionOverrides);
  const isDirty = OVERRIDABLE.some((t) => toggles[t.id] !== baseline[t.id]);

  const handleSave = async () => {
    if (!perms.lawyerId || perms.lawyerId === "ALL") {
      setError("تعذّر تحديد المكتب. سجّل الخروج ثم الدخول مجدداً.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await savePermissionOverrides(
        perms.lawyerId,
        togglesToOverrides(toggles),
        perms.userId,
      );

      // سجل تدقيق: تغيير الصلاحيات من أخطر العمليات — نسجّل ما تغيّر بالضبط
      const changed = OVERRIDABLE.filter((t) => toggles[t.id] !== baseline[t.id]);
      if (changed.length) {
        await writeAudit({
          action: "PERMISSION_CHANGE",
          entity: "permissions",
          entityLabel: changed.map((t) => t.label).join("، "),
          before: Object.fromEntries(changed.map((t) => [t.label, baseline[t.id] ? "مفعّل" : "مطفأ"])),
          after: Object.fromEntries(changed.map((t) => [t.label, toggles[t.id] ? "مفعّل" : "مطفأ"])),
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ الصلاحيات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setToggles(Object.fromEntries(OVERRIDABLE.map((t) => [t.id, t.defaultOn])));
  };

  return (
    <div className="space-y-8">

      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <Shield className="text-blue-600 mt-1 shrink-0" size={20} />
        <div>
          <p className="font-bold text-blue-900 text-sm">نظام الصلاحيات</p>
          <p className="text-sm text-blue-700">
            الصلاحيات الافتراضية مأخوذة من وثيقة متطلبات النظام. يمكنك تعديل
            استثناءات محدودة أدناه، وتُطبَّق على كل مستخدمي مكتبك.
          </p>
        </div>
      </div>

      {!canManage && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
          <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={18} />
          <p className="text-sm text-amber-800">
            أنت تطّلع على الصلاحيات فقط — تعديلها متاح لمدير المكتب.
          </p>
        </div>
      )}

      {/* ===== الاستثناءات القابلة للتعديل ===== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-[#133B2E]">استثناءات مكتبك</h3>
          {canManage && (
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 hover:text-[#133B2E] flex items-center gap-1"
            >
              <RotateCcw size={13} /> استعادة الافتراضي
            </button>
          )}
        </div>

        {OVERRIDABLE.map((item) => {
          const on = toggles[item.id] ?? item.defaultOn;
          const changed = on !== item.defaultOn;
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
                changed ? "border-[#D4AF37]/40 bg-[#D4AF37]/5" : "border-gray-100"
              }`}
            >
              <div className="min-w-0">
                <p className="font-bold text-[#133B2E] text-sm flex items-center gap-2 flex-wrap">
                  {item.label}
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {ROLE_LABELS_AR[item.role]}
                  </span>
                  {changed && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#133B2E]">
                      معدّل
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={item.label}
                disabled={!canManage}
                onClick={() => setToggles((t) => ({ ...t, [item.id]: !on }))}
                className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${
                  on ? "bg-[#D4AF37]" : "bg-gray-200"
                } ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                    on ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>
          );
        })}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {canManage && (
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="px-6 py-3 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl text-sm hover:bg-[#133B2E]/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save size={16} />
              {saving ? "جاري الحفظ..." : "حفظ الصلاحيات"}
            </button>
            {saved && (
              <span className="text-sm text-green-600 font-bold flex items-center gap-1">
                <Check size={16} /> تم الحفظ وتطبيقه على المكتب
              </span>
            )}
            {isDirty && !saved && (
              <span className="text-xs text-gray-400">توجد تغييرات غير محفوظة</span>
            )}
          </div>
        )}
      </div>

      {/* ===== مصفوفة الصلاحيات من الوثيقة ===== */}
      <div className="space-y-3 border-t border-gray-100 pt-6">
        <div>
          <h3 className="text-base font-black text-[#133B2E]">مصفوفة الصلاحيات</h3>
          <p className="text-xs text-gray-500 mt-1">
            الصلاحيات المعتمدة لكل دور حسب وثيقة متطلبات النظام. الخلايا المميّزة
            بالذهبي تعني وجود استثناء مطبَّق في مكتبك.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-[#133B2E] text-white">
                <th className="text-right py-3 px-4 font-bold whitespace-nowrap">الخدمة</th>
                {DOCUMENT_ROLES.map((r) => (
                  <th key={r} className="py-3 px-3 font-bold text-center whitespace-nowrap text-xs">
                    {ROLE_LABELS_AR[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOCUMENT_PERMISSIONS.map((p, i) => (
                <tr key={p} className={i % 2 ? "bg-gray-50/60" : "bg-white"}>
                  <td className="py-2.5 px-4 font-bold text-[#133B2E] whitespace-nowrap">
                    {PERMISSION_LABELS_AR[p]}
                  </td>
                  {DOCUMENT_ROLES.map((r) => {
                    const actual = scopeOf(r, p);
                    const original = defaultScopeOf(r, p);
                    const overridden = actual !== original;
                    return (
                      <td key={r} className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            overridden
                              ? "bg-[#D4AF37] text-[#133B2E]"
                              : actual === "NONE"
                                ? "bg-gray-100 text-gray-400"
                                : actual === "FULL"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-blue-50 text-blue-700"
                          }`}
                          title={overridden ? `الافتراضي: ${SCOPE_LABELS_AR[original]}` : undefined}
                        >
                          {SCOPE_LABELS_AR[actual]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-xl">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            «المكلف بها» = القضايا المسنَدة للمستخدم أو التي هو ضمن فريقها ·
            «أولي» = ينشئ مسودة تحتاج اعتماداً · «محدود» = تعديل الحقول الإدارية فقط ·
            «المسموح فقط» = المستندات المشارَكة مع العميل حصراً.
          </p>
        </div>
      </div>
    </div>
  );
}
