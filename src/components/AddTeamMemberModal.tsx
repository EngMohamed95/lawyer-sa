/**
 * إضافة عضو لفريق المكتب بأي دور من الأدوار السبعة المسموحة.
 *
 * يتبع نفس نمط AddOfficeLawyerModal و AddTraineeModal القائمين
 * (إنشاء الحساب عبر Firebase App ثانوي حتى لا يخرج المدير من جلسته)،
 * ويضيف: اختيار الدور · مولّد كلمة مرور قوية · تحقق من المدخلات ·
 * رسائل داخل النافذة بدل alert.
 *
 * ⚠️ لا يسمح بإنشاء SUPER_ADMIN ولا LAWYER — هذه القائمة هي الحاجز الأول،
 *    والحاجز الحقيقي يأتي في قواعد Firestore (الميزة 001) والخادم (003).
 */

import { useState } from "react";
import { X, UserPlus, Mail, Phone, Lock, Shield, Copy, Check, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  ROLES_CREATABLE_BY_OFFICE,
  ROLE_DESCRIPTIONS_AR,
  ROLE_LABELS_AR,
  type Role,
} from "../lib/roles";
import { writeAudit } from "../lib/audit";

interface AddTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** دور مبدئي مختار — تستخدمه الشاشات المتخصصة */
  defaultRole?: Role;
}

const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";

function generatePassword(length = 16): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

export default function AddTeamMemberModal({
  isOpen, onClose, onSuccess, defaultRole,
}: AddTeamMemberModalProps) {
  const [role, setRole] = useState<Role>(defaultRole ?? "OFFICE_LAWYER");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setForm({ name: "", email: "", phone: "", password: "" });
    setRole(defaultRole ?? "OFFICE_LAWYER");
    setError(""); setCreated(null); setCopied(false);
  };

  const closeAndReset = () => { reset(); onClose(); };

  const validate = (): string => {
    if (!form.name.trim()) return "الاسم مطلوب";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "البريد الإلكتروني غير صحيح";
    if (form.password.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
    if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      return "كلمة المرور يجب أن تجمع بين حروف وأرقام";
    if (!ROLES_CREATABLE_BY_OFFICE.includes(role)) return "لا يمكنك إنشاء حساب بهذا الدور";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError("");

    let secondaryApp: import("firebase/app").FirebaseApp | null = null;
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      const { db, firebaseConfig } = await import("../lib/firebase");
      const { initializeApp, deleteApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");

      const lawyerId = localStorage.getItem("lawyerId");
      if (!lawyerId || lawyerId === "ALL") {
        setError("تعذّر تحديد المكتب. سجّل الخروج ثم الدخول مجدداً.");
        setLoading(false);
        return;
      }

      // حساب ثانوي حتى لا تنتهي جلسة المدير الحالي
      secondaryApp = initializeApp(firebaseConfig, "TeamMemberCreation_" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);

      await setDoc(doc(db, "users", cred.user.uid), {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role,
        lawyerId,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        createdBy: localStorage.getItem("userId") ?? null,
        deletedAt: null,           // جاهز للحذف الناعم
      });

      await writeAudit({
        action: "CREATE",
        entity: "user",
        entityId: cred.user.uid,
        entityLabel: `${form.name.trim()} — ${ROLE_LABELS_AR[role]}`,
        after: { name: form.name.trim(), email: form.email.trim(), role },
      });

      setCreated({ email: form.email.trim(), password: form.password });
      onSuccess();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message;
      setError(
        code === "auth/email-already-in-use" ? "هذا البريد الإلكتروني مسجّل مسبقاً"
        : code === "auth/invalid-email" ? "صيغة البريد الإلكتروني غير صحيحة"
        : code === "auth/weak-password" ? "كلمة المرور ضعيفة جداً"
        : message || "حدث خطأ أثناء الإنشاء"
      );
    } finally {
      if (secondaryApp) {
        const { deleteApp } = await import("firebase/app");
        await deleteApp(secondaryApp).catch(() => { /* التنظيف ليس حرجاً */ });
      }
      setLoading(false);
    }
  };

  const copyCredentials = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(
      `البريد: ${created.email}\nكلمة المرور: ${created.password}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-300">

        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#133B2E] text-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">إضافة عضو لفريق المكتب</h2>
              <p className="text-xs text-[#D4AF37]">إنشاء حساب دخول وتحديد الدور والصلاحيات</p>
            </div>
          </div>
          <button onClick={closeAndReset} className="p-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {created ? (
          /* ===== شاشة النجاح: بيانات الدخول تُعرض مرة واحدة ===== */
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-100">
              <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0">
                <Check size={20} />
              </div>
              <div>
                <p className="font-bold text-green-900">تم إنشاء الحساب بنجاح</p>
                <p className="text-sm text-green-700">
                  الدور: {ROLE_LABELS_AR[role]} — يمكنه تسجيل الدخول الآن
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 space-y-3">
              <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <AlertCircle size={16} />
                انسخ بيانات الدخول الآن — لن تظهر كلمة المرور مرة أخرى
              </p>
              <div className="bg-white rounded-xl p-4 font-mono text-sm space-y-2 border border-amber-200" dir="ltr">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">email</span>
                  <span className="text-gray-900 break-all">{created.email}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">password</span>
                  <span className="text-gray-900 break-all">{created.password}</span>
                </div>
              </div>
              <Button
                type="button"
                onClick={copyCredentials}
                className="w-full py-5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold"
              >
                {copied ? <><Check size={16} className="ml-2" /> تم النسخ</> : <><Copy size={16} className="ml-2" /> نسخ البيانات</>}
              </Button>
            </div>

            <div className="flex gap-3">
              <Button type="button" onClick={reset}
                className="flex-1 py-5 bg-[#133B2E] text-[#D4AF37] rounded-2xl font-bold hover:bg-[#133B2E]/90">
                إضافة عضو آخر
              </Button>
              <Button type="button" variant="outline" onClick={closeAndReset}
                className="flex-1 py-5 border-gray-200 text-gray-600 rounded-2xl hover:bg-gray-50">
                إغلاق
              </Button>
            </div>
          </div>
        ) : (
          /* ===== نموذج الإنشاء ===== */
          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">

            {error && (
              <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* اختيار الدور */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-[#133B2E] block">الدور والصلاحيات</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLES_CREATABLE_BY_OFFICE.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`text-right p-3 rounded-2xl border-2 transition-all ${
                      role === r
                        ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-[#133B2E]">{ROLE_LABELS_AR[r]}</span>
                      {role === r && <Check size={16} className="text-[#D4AF37] shrink-0" />}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      {ROLE_DESCRIPTIONS_AR[r]}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 block mr-1">الاسم الكامل</label>
              <input
                required type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all"
                placeholder="الاسم رباعي"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block mr-1">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    required type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all"
                    placeholder="name@example.com" dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block mr-1">رقم الهاتف</label>
                <div className="relative">
                  <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="tel" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all"
                    placeholder="05xxxxxxxx" dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 block mr-1">كلمة المرور</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    required type="text" value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all font-mono text-sm"
                    placeholder="8 أحرف على الأقل، حروف وأرقام" dir="ltr"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => setForm({ ...form, password: generatePassword() })}
                  variant="outline"
                  className="px-4 rounded-2xl border-gray-200 text-[#133B2E] hover:bg-gray-50 shrink-0"
                  title="توليد كلمة مرور قوية"
                >
                  <RefreshCw size={16} />
                </Button>
              </div>
              <p className="text-xs text-gray-400 mr-1">
                اضغط زر التوليد لإنشاء كلمة مرور قوية عشوائية (16 حرفاً)
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
              <Shield className="text-blue-600 mt-0.5 shrink-0" size={18} />
              <p className="text-xs text-blue-800 leading-relaxed">
                سيُنشأ الحساب داخل مكتبك، ولن يصل إلى بيانات أي مكتب آخر.
                صلاحياته محكومة بمصفوفة صلاحيات دور <strong>{ROLE_LABELS_AR[role]}</strong>،
                ويمكنك مراجعتها من الإعدادات ← الصلاحيات.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}
                className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90 active:scale-[0.98] transition-all">
                {loading ? "جاري الإنشاء..." : "إنشاء الحساب"}
              </Button>
              <Button type="button" variant="outline" onClick={closeAndReset}
                className="flex-1 py-6 border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50 transition-all">
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
