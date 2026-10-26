/**
 * ترويسة المكتب (مطبوعات المكتب) — الشعار والاسم والعنوان والهاتف والسجل
 * التجاري. تُستخدم كترويسة موحّدة أعلى التقارير والمستندات الرسمية المطبوعة
 * (راجع تبويب "التقارير" في src/pages/CaseDetails.tsx).
 */

import { useEffect, useRef, useState } from "react";
import { Building2, UploadCloud, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { usePermissions } from "../../lib/usePermissions";
import { useOfficeSettings, saveOfficeProfile, type OfficeProfile } from "../../lib/officeSettings";
import LetterheadPaper from "./LetterheadPaper";

export default function OfficeProfileCard() {
  const perms = usePermissions();
  const office = useOfficeSettings();
  const canManage = perms.can("settings.manage");
  const logoRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<OfficeProfile>(office.officeProfile);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setProfile(office.officeProfile), [office]);

  const isDirty = JSON.stringify(profile) !== JSON.stringify(office.officeProfile);

  const handleLogoFile = async (file: File) => {
    setUploadingLogo(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch("/upload.php", { method: "POST", body: fd });
      if (!response.ok) throw new Error("فشل الرفع إلى السيرفر.");
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      setProfile((p) => ({ ...p, logoUrl: result.fileUrl }));
    } catch (err) {
      console.error(err);
      setError("تعذّر رفع الشعار. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setUploadingLogo(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!perms.lawyerId || perms.lawyerId === "ALL") {
      setError("تعذّر تحديد المكتب. سجّل الخروج ثم الدخول مجدداً.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveOfficeProfile(perms.lawyerId, profile, perms.userId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ بيانات المكتب. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
    <div className="w-full max-w-md shrink-0 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 size={16} className="text-ink" />
        <label className="text-sm font-bold text-gray-700">مطبوعات المكتب (الترويسة الرسمية)</label>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed -mt-2">
        تظهر هذه البيانات كترويسة أعلى التقارير والمستندات الرسمية المطبوعة.
      </p>

      <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-2xl bg-gray-50/50">
        {profile.logoUrl ? (
          <img src={profile.logoUrl} alt="شعار المكتب" className="w-16 h-16 object-contain bg-surface rounded-xl border border-gray-200 p-1" />
        ) : (
          <div className="w-16 h-16 flex items-center justify-center bg-surface rounded-xl border border-dashed border-gray-300 text-gray-300">
            <Building2 size={24} />
          </div>
        )}
        {canManage && (
          <div>
            <input ref={logoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoFile(f); }} />
            <button type="button" disabled={uploadingLogo} onClick={() => logoRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-navy text-ink-2 font-bold rounded-xl text-xs hover:bg-navy/90 transition disabled:opacity-50">
              {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
              {profile.logoUrl ? "استبدال الشعار" : "رفع شعار المكتب"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-600">اسم المكتب</label>
        <input type="text" disabled={!canManage} value={profile.name}
          onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-600">اسم المكتب بالإنجليزية (اختياري)</label>
        <input type="text" dir="ltr" disabled={!canManage} value={profile.nameEn} placeholder="e.g. Al-Riyadh Law Firm"
          onChange={(e) => setProfile((p) => ({ ...p, nameEn: e.target.value }))}
          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-600">العنوان</label>
        <input type="text" disabled={!canManage} value={profile.address}
          onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-600">رقم الهاتف</label>
          <input type="text" dir="ltr" disabled={!canManage} value={profile.phone}
            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-600">رقم هاتف آخر (اختياري)</label>
          <input type="text" dir="ltr" disabled={!canManage} value={profile.phone2}
            onChange={(e) => setProfile((p) => ({ ...p, phone2: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
        </div>
        <div className="space-y-2 col-span-2">
          <label className="text-xs font-bold text-gray-600">البريد الإلكتروني (اختياري)</label>
          <input type="email" dir="ltr" disabled={!canManage} value={profile.email}
            onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-600">السجل التجاري</label>
          <input type="text" dir="ltr" disabled={!canManage} value={profile.crNumber}
            onChange={(e) => setProfile((p) => ({ ...p, crNumber: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-600">رقم ترخيص المحاماة (اختياري)</label>
          <input type="text" dir="ltr" disabled={!canManage} value={profile.licenseNumber}
            onChange={(e) => setProfile((p) => ({ ...p, licenseNumber: e.target.value }))}
            className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:outline-none focus:border-edge text-sm disabled:bg-gray-50" />
        </div>
      </div>

      {canManage && (
        <button onClick={handleSave} disabled={saving || !isDirty}
          className="px-6 py-3 bg-navy text-ink-2 font-bold rounded-2xl text-sm hover:bg-navy/90 transition disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? "جاري الحفظ..." : "حفظ بيانات المكتب"}
        </button>
      )}
      {saved && (
        <span className="text-xs text-green-600 font-bold flex items-center gap-1">
          <CheckCircle2 size={14} /> تم الحفظ
        </span>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}
    </div>

      {/* ورقة A4 حيّة بترويسة المذكرات وتذييلها كما تُطبع — والكتابة فيها تعدّل البيانات مباشرة */}
      <div className="min-w-0 flex-1 space-y-2 xl:sticky xl:top-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-bold text-gray-600">معاينة ورقة المذكرة (A4)</span>
          {canManage && <span className="text-[11px] text-gray-400">اضغط على أي نص في الورقة لتعديله، أو على الشعار لتغييره — ثم احفظ</span>}
        </div>
        <div className="rounded-2xl bg-slate-100 p-4 sm:p-6">
          <LetterheadPaper
            profile={profile}
            editable={canManage}
            onChange={(key, value) => setProfile((p) => ({ ...p, [key]: value }))}
            onLogoClick={() => { if (!uploadingLogo) logoRef.current?.click(); }}
          />
        </div>
      </div>
    </div>
  );
}
