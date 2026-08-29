/**
 * إعدادات الذكاء الاصطناعي على مستوى المنصة — لمدير المنصة (SUPER_ADMIN)
 * فقط. لا تظهر لأي مكتب (عميل)، ولا تحتوي على حقل مفتاح API إطلاقاً —
 * المفتاح الفعلي متغيّر بيئة على الخادم (راجع src/lib/platformSettings.ts
 * لشرح السبب الأمني).
 */

import { useEffect, useState } from "react";
import { Sparkles, AlertCircle, Check, ShieldAlert, KeyRound } from "lucide-react";
import {
  usePlatformAiSettings,
  savePlatformAiSettings,
  type PlatformAiSettings,
} from "../../lib/platformSettings";
import { usePermissions } from "../../lib/usePermissions";

export default function PlatformAiSettingsTab() {
  const perms = usePermissions();
  const stored = usePlatformAiSettings();
  const isSuperAdmin = perms.role === "SUPER_ADMIN";

  const [draft, setDraft] = useState<PlatformAiSettings>(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(stored), [stored]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(stored);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center text-gray-400">
        <ShieldAlert size={32} />
        <p className="font-bold text-gray-500">هذا القسم مقصور على مدير المنصة.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await savePlatformAiSettings(draft, perms.userId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ الإعدادات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3">
        <Sparkles className="text-blue-600 mt-1 shrink-0" size={20} />
        <div>
          <p className="font-bold text-blue-900 text-sm">محرك ذكاء اصطناعي واحد لكل المكاتب</p>
          <p className="text-sm text-blue-700">
            هذا الإعداد مركزي ويُطبَّق فوراً على كل مكاتب المنصة — لا يملك أي مكتب إعداداً خاصاً به.
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
        <KeyRound className="text-amber-600 mt-1 shrink-0" size={20} />
        <div className="text-sm text-amber-800 leading-relaxed">
          <p className="font-bold mb-1">مفتاح API نفسه لا يُضبط من هنا</p>
          <p>
            لأسباب أمنية، المفتاح الفعلي (<code dir="ltr">GEMINI_API_KEY</code> / <code dir="ltr">GROQ_API_KEY</code>)
            يبقى متغيّر بيئة على الخادم فقط — لا تصل إليه أي واجهة، فلا يستطيع أي مستخدم استخراجه.
            لتغييره: عدّل ملف <code dir="ltr">.env</code> على الخادم وأعد تشغيله.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-700">مزوّد خدمة الذكاء الاصطناعي</label>
        <select
          value={draft.provider}
          onChange={(e) => {
            const provider = e.target.value as PlatformAiSettings["provider"];
            const model = provider === "GROQ" ? "llama-3.3-70b-versatile" : "gemini-flash-latest";
            setDraft((d) => ({ ...d, provider, model }));
          }}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#133B2E]"
        >
          <option value="GEMINI">Google Gemini API (مستحسن للأبحاث والملفات الضخمة)</option>
          <option value="GROQ">Groq API (أداء فائق السرعة)</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-700">النموذج النشط (Active Model)</label>
        <select
          value={draft.model}
          onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#133B2E]"
        >
          {draft.provider === "GEMINI" ? (
            <>
              <option value="gemini-flash-latest">Gemini Flash (الافتراضي السريع والمجاني - مستحسن)</option>
              <option value="gemini-pro-latest">Gemini Pro (التحليل الذكي والعميق)</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash (إصدار حديث وسريع)</option>
              <option value="gemini-3.6-flash">Gemini 3.6 Flash (آخر إصدار مستقر)</option>
            </>
          ) : (
            <>
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
            </>
          )}
        </select>
      </div>

      <div className="space-y-2 pt-2">
        <label className="text-xs font-bold text-gray-700 block mb-1">الميزات الذكية المفعّلة لكل المكاتب</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={draft.aiAnalysisEnabled}
              onChange={(e) => setDraft((d) => ({ ...d, aiAnalysisEnabled: e.target.checked }))}
              className="rounded text-[#D4AF37] focus:ring-[#D4AF37]" />
            تحليل قضايا واستخراج الوقائع والطلبات
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={draft.aiDraftingEnabled}
              onChange={(e) => setDraft((d) => ({ ...d, aiDraftingEnabled: e.target.checked }))}
              className="rounded text-[#D4AF37] focus:ring-[#D4AF37]" />
            إنشاء وصياغة المذكرات واللوائح القانونية
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={draft.aiRisksEnabled}
              onChange={(e) => setDraft((d) => ({ ...d, aiRisksEnabled: e.target.checked }))}
              className="rounded text-[#D4AF37] focus:ring-[#D4AF37]" />
            تحليل العقود واكتشاف المخاطر والبنود المفقودة
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="px-6 py-3 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl text-sm hover:bg-[#133B2E]/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "جاري الحفظ..." : "حفظ الإعدادات لكل المكاتب"}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-bold flex items-center gap-1">
            <Check size={16} /> تم الحفظ وتطبيقه فوراً على كل المكاتب
          </span>
        )}
      </div>
    </div>
  );
}
