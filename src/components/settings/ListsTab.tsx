/**
 * تبويب القوائم والتصنيفات — يدير القوائم المرجعية (أنواع القضايا، أنواع
 * المستندات، فئات المصروفات) بدل أن تكون مكتوبة داخل الكود. القيم تُحفظ
 * في Firestore وتؤثر فوراً في نماذج الإضافة عبر officeLookups.ts.
 */

import { useEffect, useState } from "react";
import { AlertCircle, Check, ListChecks, Plus, Save, Trash2 } from "lucide-react";
import {
  DEFAULT_LOOKUPS,
  saveOfficeLookups,
  useOfficeLookups,
  type LookupOption,
  type OfficeLookups,
} from "../../lib/officeLookups";
import { usePermissions } from "../../lib/usePermissions";

function StringListEditor({
  title,
  description,
  items,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  items: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-black text-[#133B2E]">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-sm text-[#133B2E]"
          >
            {item}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-gray-400">لا توجد عناصر بعد</span>}
      </div>

      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="إضافة عنصر جديد..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#133B2E] bg-white"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = draft.trim();
                if (v && !items.includes(v)) onChange([...items, v]);
                setDraft("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const v = draft.trim();
              if (v && !items.includes(v)) onChange([...items, v]);
              setDraft("");
            }}
            className="px-3 py-2 rounded-xl bg-[#133B2E] text-[#D4AF37] text-sm font-bold flex items-center gap-1"
          >
            <Plus size={14} /> إضافة
          </button>
        </div>
      )}
    </div>
  );
}

function OptionListEditor({
  title,
  description,
  items,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  items: LookupOption[];
  onChange: (next: LookupOption[]) => void;
  disabled: boolean;
}) {
  const [draftLabel, setDraftLabel] = useState("");

  const addOption = () => {
    const label = draftLabel.trim();
    if (!label) return;
    const value = label.replace(/\s+/g, "_").toUpperCase() + "_" + Date.now().toString(36).slice(-4);
    onChange([...items, { value, label }]);
    setDraftLabel("");
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-black text-[#133B2E]">{title}</h3>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span
            key={`${item.value}-${i}`}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-sm text-[#133B2E]"
          >
            {item.label}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-gray-400">لا توجد عناصر بعد</span>}
      </div>

      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="إضافة تصنيف جديد..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#133B2E] bg-white"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOption();
              }
            }}
          />
          <button
            type="button"
            onClick={addOption}
            className="px-3 py-2 rounded-xl bg-[#133B2E] text-[#D4AF37] text-sm font-bold flex items-center gap-1"
          >
            <Plus size={14} /> إضافة
          </button>
        </div>
      )}
    </div>
  );
}

export default function ListsTab() {
  const perms = usePermissions();
  const stored = useOfficeLookups();

  const [draftLookups, setDraftLookups] = useState<OfficeLookups>(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftLookups(stored);
  }, [stored]);

  const canManage = perms.can("settings.manage");
  const isDirty = JSON.stringify(draftLookups) !== JSON.stringify(stored);

  const handleSave = async () => {
    if (!perms.lawyerId || perms.lawyerId === "ALL") {
      setError("تعذّر تحديد المكتب. سجّل الخروج ثم الدخول مجدداً.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveOfficeLookups(perms.lawyerId, draftLookups);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ القوائم. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setDraftLookups(DEFAULT_LOOKUPS);

  return (
    <div className="space-y-8">
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <ListChecks className="text-blue-600 mt-1 shrink-0" size={20} />
        <div>
          <p className="font-bold text-blue-900 text-sm">القوائم والتصنيفات</p>
          <p className="text-sm text-blue-700">
            هذه القوائم تظهر في نماذج إضافة القضايا والمستندات والمصروفات. أي
            تعديل هنا ينعكس فوراً على كل مستخدمي مكتبك.
          </p>
        </div>
      </div>

      {!canManage && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
          <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={18} />
          <p className="text-sm text-amber-800">أنت تطّلع على القوائم فقط — تعديلها متاح لمدير المكتب.</p>
        </div>
      )}

      <StringListEditor
        title="أنواع القضايا"
        description="تظهر عند إضافة أو تعديل قضية"
        items={draftLookups.caseTypes}
        onChange={(caseTypes) => setDraftLookups((d) => ({ ...d, caseTypes }))}
        disabled={!canManage}
      />

      <OptionListEditor
        title="أنواع المستندات"
        description="تظهر عند رفع مستند جديد لقضية"
        items={draftLookups.documentTypes}
        onChange={(documentTypes) => setDraftLookups((d) => ({ ...d, documentTypes }))}
        disabled={!canManage}
      />

      <OptionListEditor
        title="فئات المصروفات"
        description="تظهر عند تسجيل مصروف جديد على قضية"
        items={draftLookups.expenseCategories}
        onChange={(expenseCategories) => setDraftLookups((d) => ({ ...d, expenseCategories }))}
        disabled={!canManage}
      />

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-6 py-3 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl text-sm hover:bg-[#133B2E]/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 mt-4"
          >
            <Save size={16} />
            {saving ? "جاري الحفظ..." : "حفظ القوائم"}
          </button>
          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-[#133B2E] mt-4"
          >
            استعادة الافتراضي
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-bold flex items-center gap-1 mt-4">
              <Check size={16} /> تم الحفظ وتطبيقه على المكتب
            </span>
          )}
        </div>
      )}
    </div>
  );
}
