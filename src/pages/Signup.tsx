/**
 * التسجيل الذاتي للمكاتب — فترة تجريبية مجانية.
 *
 * الخطوة 1: بيانات المكتب والمالك وحجم الفريق + كلمة المرور → يُنشأ مستخدم Firebase Auth
 *           ويُرسل رمز التأكيد للبريد (public/signup.php).
 * الخطوة 2: رمز OTP من 6 أرقام → الخادم يؤكد البريد وينشئ حساب المكتب، ثم ننتقل لإعداد المكتب.
 *
 * ?resume=1 — مستخدم أنشأ حسابه ولم يؤكد بريده (يأتي من صفحة الدخول): نعيد إرسال الرمز.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { motion } from "motion/react";
import {
  Building2, User, Mail, Phone, Lock, Eye, EyeOff, Users, Briefcase, GraduationCap,
  UserCog, ShieldCheck, Loader2, ArrowRight, MailCheck, Scale,
} from "lucide-react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { startSession } from "../lib/session";

type Country = "SA" | "EG" | "OTHER";

interface SignupForm {
  officeName: string;
  name: string;
  email: string;
  phone: string;
  country: Country;
  password: string;
  confirm: string;
  team: { lawyers: string; consultants: string; trainees: string; staff: string };
}

const EMPTY_FORM: SignupForm = {
  officeName: "", name: "", email: "", phone: "", country: "SA", password: "", confirm: "",
  team: { lawyers: "1", consultants: "0", trainees: "0", staff: "0" },
};

const TEAM_FIELDS: { key: keyof SignupForm["team"]; label: string; icon: typeof Users }[] = [
  { key: "lawyers", label: "المحامون", icon: Scale },
  { key: "consultants", label: "المستشارون", icon: Briefcase },
  { key: "trainees", label: "المتدربون", icon: GraduationCap },
  { key: "staff", label: "الموظفون الإداريون", icon: UserCog },
];

class SignupApiError extends Error {
  code: string;
  retryAfter?: number;
  constructor(message: string, code: string, retryAfter?: number) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function callSignupApi(user: FirebaseUser, body: Record<string, unknown>) {
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch("/signup.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SignupApiError("تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.", "NETWORK");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new SignupApiError(data?.error || "حدث خطأ غير متوقع. أعد المحاولة.", data?.code || "ERROR", data?.retryAfter);
  }
  return data;
}

const toCount = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : NaN;
};

function validate(form: SignupForm, needsPassword: boolean): string {
  if (form.officeName.trim().length < 2) return "اكتب اسم المكتب.";
  if (form.name.trim().length < 2) return "اكتب اسمك الكامل.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "البريد الإلكتروني غير صالح.";
  if (!/^\+?[0-9]{8,15}$/.test(form.phone.replace(/[\s\-()]/g, ""))) return "رقم الجوال غير صالح — أرقام فقط (8 إلى 15 رقماً).";
  for (const f of TEAM_FIELDS) {
    if (Number.isNaN(toCount(form.team[f.key]))) return `عدد ${f.label} غير صالح.`;
  }
  if (needsPassword) {
    if (form.password.length < 8) return "كلمة المرور يجب ألا تقل عن 8 أحرف.";
    if (form.password !== form.confirm) return "كلمتا المرور غير متطابقتين.";
  }
  return "";
}

const inputClass =
  "w-full pr-11 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-edge/20 focus:border-edge transition-all dark:bg-white/5 dark:border-white/10";

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resume = searchParams.get("resume") === "1";

  const [step, setStep] = useState<"loading" | "form" | "otp">(resume ? "loading" : "form");
  const [form, setForm] = useState<SignupForm>(EMPTY_FORM);
  /** مستخدم Auth موجود (استكمال تسجيل) — لا نطلب كلمة مرور ولا ننشئ حساباً جديداً */
  const [existingUser, setExistingUser] = useState<FirebaseUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // عدّاد إعادة الإرسال
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "otp") codeRef.current?.focus();
  }, [step]);

  // استكمال تسجيل لم يُؤكَّد: نعيد إرسال الرمز ببيانات المكتب المحفوظة على الخادم
  useEffect(() => {
    if (!resume) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsub();
      if (!u) {
        setStep("form");
        return;
      }
      try {
        const profile = await getDoc(doc(db, "users", u.uid));
        if (profile.exists()) {
          navigate("/login", { replace: true });
          return;
        }
      } catch {
        /* قبل التأكيد لا مستند — والقراءة قد تُرفض؛ نكمل */
      }
      // نعرض النموذج دائماً ليؤكد صاحب البريد بيانات مكتبه بنفسه — لا نعيد الإرسال
      // ببيانات محفوظة قد يكون أدخلها غيره قبل أن يستعيد كلمة المرور
      setExistingUser(u);
      setForm((f) => ({ ...f, email: u.email || "" }));
      setStep("form");
    });
    return unsub;
  }, [resume, navigate]);

  const setField = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const problem = validate(form, !existingUser);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      let user = existingUser;
      const email = form.email.trim().toLowerCase();
      if (!user) {
        try {
          user = (await createUserWithEmailAndPassword(auth, email, form.password)).user;
        } catch (err: any) {
          if (err?.code !== "auth/email-already-in-use") throw err;
          // ربما بدأ التسجيل سابقاً ولم يكمله — ندخله بنفس كلمة المرور ونكمل
          try {
            user = (await signInWithEmailAndPassword(auth, email, form.password)).user;
          } catch {
            throw new Error("هذا البريد مسجّل مسبقاً. سجّل الدخول، أو استخدم «نسيت كلمة المرور؟» من صفحة الدخول.");
          }
          const profile = await getDoc(doc(db, "users", user.uid)).catch(() => null);
          if (profile?.exists()) {
            await signOut(auth);
            throw new Error("هذا البريد لديه حساب مفعّل بالفعل. سجّل الدخول من صفحة الدخول.");
          }
        }
        setExistingUser(user);
      }

      const data = await callSignupApi(user, {
        action: "start",
        profile: {
          officeName: form.officeName.trim(),
          name: form.name.trim(),
          phone: form.phone.replace(/[\s\-()]/g, ""),
          country: form.country,
          team: {
            lawyers: toCount(form.team.lawyers),
            consultants: toCount(form.team.consultants),
            trainees: toCount(form.team.trainees),
            staff: toCount(form.team.staff),
          },
        },
      });
      setSentTo(data.email || email);
      setCooldown(data.resendIn || 60);
      setCode("");
      setStep("otp");
    } catch (err: any) {
      if (err?.code === "COOLDOWN") {
        setCooldown(err.retryAfter || 60);
        setSentTo(form.email.trim().toLowerCase());
        setStep("otp");
      } else if (err?.code === "auth/weak-password") {
        setError("كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل مع أرقام.");
      } else if (err?.code === "auth/invalid-email") {
        setError("البريد الإلكتروني غير صالح.");
      } else if (err?.code === "auth/network-request-failed") {
        setError("تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.");
      } else {
        setError(err?.message || "تعذّر إنشاء الحساب. أعد المحاولة.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const user = existingUser || auth.currentUser;
    if (!user) {
      setError("انتهت الجلسة. ابدأ التسجيل من جديد.");
      setStep("form");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("أدخل الرمز المكوّن من 6 أرقام.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await callSignupApi(user, { action: "verify", code });
      // التوكن الجديد يحمل email_verified=true
      await user.getIdToken(true);
      await user.reload();
      const destination = await startSession(auth.currentUser || user, { rememberMe: true });
      navigate(destination, { replace: true });
    } catch (err: any) {
      if (err?.code === "ALREADY_ACTIVE") {
        // الحساب أُنشئ (طلب سابق نجح) — نبدأ الجلسة مباشرة
        const destination = await startSession(user, { rememberMe: true }).catch(() => "/login");
        navigate(destination, { replace: true });
        return;
      }
      setError(err?.message || "تعذّر التحقق من الرمز.");
      if (err?.code === "TOO_MANY_ATTEMPTS" || err?.code === "CODE_EXPIRED") setCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    const user = existingUser || auth.currentUser;
    if (!user || cooldown > 0) return;
    setBusy(true);
    setError("");
    try {
      const data = await callSignupApi(user, { action: "resend" });
      setCooldown(data.resendIn || 60);
      setCode("");
    } catch (err: any) {
      if (err?.code === "COOLDOWN") setCooldown(err.retryAfter || 60);
      else if (err?.code === "NO_PENDING") setStep("form");
      setError(err?.message || "تعذّر إعادة الإرسال.");
    } finally {
      setBusy(false);
    }
  };

  /** بريد خاطئ: نحذف الحساب غير المؤكد ونعود للنموذج */
  const handleChangeEmail = async () => {
    const user = existingUser || auth.currentUser;
    setBusy(true);
    try {
      if (user) await user.delete().catch(() => signOut(auth));
    } finally {
      setExistingUser(null);
      setCode("");
      setError("");
      setForm((f) => ({ ...f, password: "", confirm: "" }));
      setStep("form");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-navy font-['Tajawal'] py-8" dir="rtl">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-navy-2/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/20 blur-[100px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[1100px] flex flex-col md:flex-row bg-navy/40 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden mx-4"
      >
        {/* الجانب التعريفي */}
        <div className="hidden md:flex md:w-5/12 p-10 flex-col justify-between relative overflow-hidden bg-gradient-to-bl from-navy/50 to-transparent">
          <div className="relative z-10">
            <Link to="/" className="block w-44 mb-10">
              <img src="/logo-light.png" alt="موازين" className="w-full h-auto object-contain" />
            </Link>
            <h1 className="text-3xl lg:text-4xl font-bold text-white mb-5 leading-tight">
              جرّب موازين <br />
              <span className="text-ink-2">مجاناً لمدة 14 يوماً</span>
            </h1>
            <p className="text-gray-300 leading-relaxed">
              كل مزايا إدارة المكتب بين يديك: القضايا والجلسات والعملاء والمستندات والحسابات — بدون أي التزام أو بطاقة دفع.
            </p>
          </div>
          <ul className="relative z-10 space-y-3 text-sm text-gray-300">
            {["تأكيد البريد برمز آمن", "إعداد شعار المكتب وختمه في دقيقة", "اختر باقتك في أي وقت خلال التجربة"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                  <ShieldCheck size={15} className="text-ink-2" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* النموذج */}
        <div className="w-full md:w-7/12 p-6 sm:p-10 bg-surface">
          <div className="md:hidden mb-6 flex justify-center">
            <div className="bg-navy rounded-2xl px-5 py-3">
              <img src="/logo-light.png" alt="موازين" className="h-9 w-auto" />
            </div>
          </div>

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-gray-500">
              <Loader2 className="animate-spin" size={28} />
              <p className="text-sm">جاري تجهيز خطوة التأكيد...</p>
            </div>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <h2 className="text-2xl font-bold text-ink">إنشاء حساب مكتب جديد</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {existingUser ? "أكمل بيانات مكتبك لإرسال رمز التأكيد إلى بريدك." : "فترة تجريبية مجانية 14 يوماً — تبدأ فور تأكيد بريدك."}
                </p>
              </div>

              {error && (
                <div role="alert" className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="اسم المكتب" icon={Building2}>
                  <input className={inputClass} value={form.officeName} onChange={(e) => setField("officeName", e.target.value)}
                    placeholder="مثال: مكتب العدالة للمحاماة" autoComplete="organization" required maxLength={150} />
                </Field>
                <Field label="اسمك الكامل" icon={User}>
                  <input className={inputClass} value={form.name} onChange={(e) => setField("name", e.target.value)}
                    placeholder="الاسم كما يظهر في النظام" autoComplete="name" required maxLength={100} />
                </Field>
                <Field label="البريد الإلكتروني" icon={Mail}>
                  <input className={inputClass} type="email" dir="ltr" value={form.email} disabled={!!existingUser}
                    onChange={(e) => setField("email", e.target.value)} placeholder="name@example.com" autoComplete="email" required />
                </Field>
                <Field label="رقم الجوال" icon={Phone}>
                  <input className={inputClass} type="tel" dir="ltr" value={form.phone} onChange={(e) => setField("phone", e.target.value)}
                    placeholder="+9665xxxxxxxx" autoComplete="tel" required />
                </Field>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block" htmlFor="signup-country">الدولة</label>
                  <select id="signup-country" value={form.country} onChange={(e) => setField("country", e.target.value as Country)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-edge/20 focus:border-edge dark:bg-white/5 dark:border-white/10">
                    <option value="SA">المملكة العربية السعودية</option>
                    <option value="EG">جمهورية مصر العربية</option>
                    <option value="OTHER">دولة أخرى</option>
                  </select>
                </div>
              </div>

              <fieldset className="rounded-2xl border border-gray-200 dark:border-white/10 p-4">
                <legend className="px-2 text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Users size={16} /> فريق المكتب
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {TEAM_FIELDS.map(({ key, label, icon: Icon }) => (
                    <label key={key} className="space-y-1.5 block">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><Icon size={13} /> {label}</span>
                      <input type="number" min={0} max={1000} inputMode="numeric" value={form.team[key]}
                        onChange={(e) => setForm((f) => ({ ...f, team: { ...f.team, [key]: e.target.value } }))}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center text-ink focus:outline-none focus:ring-2 focus:ring-edge/20 focus:border-edge dark:bg-white/5 dark:border-white/10" />
                    </label>
                  ))}
                </div>
              </fieldset>

              {!existingUser && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="كلمة المرور" icon={Lock}>
                    <input className={inputClass + " pl-11"} type={showPassword ? "text" : "password"} value={form.password}
                      onChange={(e) => setField("password", e.target.value)} placeholder="8 أحرف على الأقل" autoComplete="new-password" required />
                    <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-ink">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </Field>
                  <Field label="تأكيد كلمة المرور" icon={Lock}>
                    <input className={inputClass} type={showPassword ? "text" : "password"} value={form.confirm}
                      onChange={(e) => setField("confirm", e.target.value)} placeholder="أعد كتابة كلمة المرور" autoComplete="new-password" required />
                  </Field>
                </div>
              )}

              <button type="submit" disabled={busy}
                className="w-full py-3.5 bg-navy text-ink-2 font-bold rounded-xl shadow-lg shadow-navy/20 hover:bg-navy/90 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-70">
                {busy ? <Loader2 size={20} className="animate-spin" /> : <>إنشاء الحساب وإرسال رمز التأكيد <ArrowRight size={18} className="rotate-180" /></>}
              </button>

              <p className="text-center text-sm text-gray-500">
                لديك حساب بالفعل؟{" "}
                <Link to="/login" className="font-bold text-ink hover:underline">تسجيل الدخول</Link>
              </p>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerify} className="max-w-md mx-auto space-y-6 py-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-navy/5 dark:bg-white/10 flex items-center justify-center">
                <MailCheck size={30} className="text-ink" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-ink">تأكيد البريد الإلكتروني</h2>
                <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                  أرسلنا رمزاً من 6 أرقام إلى
                  <span className="block font-bold text-ink mt-1" dir="ltr">{sentTo}</span>
                  لم تجده؟ تحقق من مجلد الرسائل غير المرغوب فيها (Spam).
                </p>
              </div>

              {error && (
                <div role="alert" className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
              )}

              <input
                ref={codeRef}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="رمز التأكيد"
                placeholder="••••••"
                dir="ltr"
                className="w-full text-center text-3xl font-bold tracking-[0.6em] py-4 bg-gray-50 border border-gray-200 rounded-2xl text-ink focus:outline-none focus:ring-2 focus:ring-edge/20 focus:border-edge dark:bg-white/5 dark:border-white/10"
              />

              <button type="submit" disabled={busy || code.length !== 6}
                className="w-full py-3.5 bg-navy text-ink-2 font-bold rounded-xl shadow-lg shadow-navy/20 hover:bg-navy/90 transition flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? <Loader2 size={20} className="animate-spin" /> : <>تأكيد وتفعيل الحساب <ShieldCheck size={18} /></>}
              </button>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                <button type="button" onClick={handleResend} disabled={busy || cooldown > 0}
                  className="font-semibold text-ink hover:underline disabled:text-gray-400 disabled:no-underline">
                  {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ث` : "إعادة إرسال الرمز"}
                </button>
                <button type="button" onClick={handleChangeEmail} disabled={busy} className="text-gray-500 hover:text-ink hover:underline">
                  استخدام بريد آخر
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 block">{label}</span>
      <span className="relative block">
        <Icon size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        {children}
      </span>
    </label>
  );
}
