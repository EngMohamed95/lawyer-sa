/**
 * تعيين كلمة مرور جديدة من رابط البريد (/reset-password?token=...).
 * الرابط لمرة وحدة وصالح لساعة؛ بعد النجاح كل الأجهزة تخرج والمستخدم يدخل من جديد.
 */

import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Lock, Eye, EyeOff, CheckCircle2, Loader2 } from "lucide-react";
import { confirmPasswordReset } from "../lib/authApi";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("كلمة المرور لازم تكون 6 أحرف على الأقل.");
    if (password !== confirm) return setError("كلمتا المرور غير متطابقتين.");
    setBusy(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "تعذّر تعيين كلمة المرور.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-navy font-['Tajawal'] p-4" dir="rtl">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl p-8">
        {!token ? (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold text-ink">رابط غير صالح</h1>
            <p className="text-gray-500">افتح الرابط من رسالة البريد كما هو، أو اطلب رابطاً جديداً من صفحة الدخول.</p>
            <Link to="/login" className="inline-block font-bold text-ink-2 hover:underline">العودة لتسجيل الدخول</Link>
          </div>
        ) : done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="mx-auto text-green-500" size={48} />
            <h1 className="text-2xl font-bold text-ink">تم تعيين كلمة المرور</h1>
            <p className="text-gray-500">سجّل الدخول الآن بكلمة المرور الجديدة.</p>
            <Link to="/login" className="inline-block rounded-xl bg-navy px-6 py-3 font-bold text-white hover:opacity-90">تسجيل الدخول</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-2">
              <h1 className="text-2xl font-bold text-ink mb-1">تعيين كلمة مرور جديدة</h1>
              <p className="text-gray-500 text-sm">اختر كلمة مرور لا تقل عن 6 أحرف.</p>
            </div>
            {[
              { label: "كلمة المرور الجديدة", value: password, set: setPassword, auto: "new-password" },
              { label: "تأكيد كلمة المرور", value: confirm, set: setConfirm, auto: "new-password" },
            ].map((f) => (
              <label key={f.label} className="block">
                <span className="block text-sm font-bold text-ink mb-2">{f.label}</span>
                <div className="relative">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={show ? "text" : "password"}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    autoComplete={f.auto}
                    required
                    className="w-full rounded-xl border border-gray-200 bg-white py-3 pr-11 pl-11 text-ink focus:outline-none focus:ring-2 focus:ring-edge/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-ink"
                    aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            ))}
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-navy py-3 font-bold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="animate-spin" size={18} />}
              حفظ كلمة المرور
            </button>
            <Link to="/login" className="block text-center text-sm text-gray-500 hover:text-ink">العودة لتسجيل الدخول</Link>
          </form>
        )}
      </div>
    </div>
  );
}
