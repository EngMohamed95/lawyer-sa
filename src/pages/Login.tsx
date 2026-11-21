import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Lock, User, Eye, EyeOff, ShieldCheck, Scale, Gavel } from "lucide-react";

const LOGIN_TIMEOUT_MS = 20_000;

function withLoginTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), LOGIN_TIMEOUT_MS);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        window.clearTimeout(timer);
        reject(reason);
      },
    );
  });
}

export default function Login() {
  const [username, setUsername] = useState(() => localStorage.getItem("rememberedEmail") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem("rememberLogin") !== "false");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const shouldRestore =
      localStorage.getItem("rememberLogin") === "true" &&
      localStorage.getItem("isAuthenticated") === "true";
    if (!shouldRestore) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void Promise.all([
      import("../lib/firebase"),
      import("firebase/auth"),
    ]).then(([{ auth }, { onAuthStateChanged }]) => {
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (!cancelled && firebaseUser) {
          navigate("/app", { replace: true });
        }
      });
    }).catch((sessionError) => {
      console.warn("تعذر استعادة جلسة الدخول المحفوظة:", sessionError);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setInfo("");

    try {
      const {
        browserLocalPersistence,
        browserSessionPersistence,
        setPersistence,
        signInWithEmailAndPassword,
      } = await import("firebase/auth");
      const { auth } = await import("../lib/firebase");
      const { startSession, NoProfileError } = await import("../lib/session");

      await withLoginTimeout(
        setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence),
        "تعذر تجهيز جلسة تسجيل الدخول. حدّث الصفحة ثم حاول مرة أخرى.",
      );

      const userCredential = await withLoginTimeout(
        signInWithEmailAndPassword(auth, username, password),
        "تعذر الاتصال بخدمة تسجيل الدخول. تحقق من الإنترنت ثم حاول مرة أخرى.",
      );
      const firebaseUser = userCredential.user;

      try {
        const destination = await startSession(firebaseUser, { rememberMe, typedEmail: username });
        navigate(destination);
      } catch (sessionError) {
        // مستخدم بلا حساب مكتب = تسجيل ذاتي لم يكتمل — نكمله، والخادم يقرّر إن كان مسموحاً
        if (sessionError instanceof NoProfileError) {
          navigate("/signup?resume=1");
          return;
        }
        throw sessionError;
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("اسم المستخدم أو كلمة المرور غير صحيحة");
      } else {
        setError(err.message || "حدث خطأ أثناء تسجيل الدخول");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setInfo("");
    const email = username.trim();
    if (!email) {
      setError("اكتب بريدك الإلكتروني أولاً ثم اضغط «نسيت كلمة المرور؟».");
      return;
    }
    try {
      const { sendPasswordResetEmail } = await import("firebase/auth");
      const { auth } = await import("../lib/firebase");
      auth.languageCode = "ar";
      await sendPasswordResetEmail(auth, email);
      setInfo("إن كان البريد مسجلاً لدينا فستصلك رسالة لإعادة تعيين كلمة المرور خلال دقائق.");
    } catch (err: any) {
      if (err?.code === "auth/invalid-email") setError("البريد الإلكتروني غير صالح.");
      else setInfo("إن كان البريد مسجلاً لدينا فستصلك رسالة لإعادة تعيين كلمة المرور خلال دقائق.");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-navy font-['Tajawal']" dir="rtl">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-[20s] hover:scale-105"
        style={{ 
          backgroundImage: `url('https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=2070&auto=format&fit=crop')`,
        }}
      >
        {/* Adjusted overlay to make the image visible on the entire page */}
        <div className="absolute inset-0 bg-navy/60 backdrop-blur-[2px]"></div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-navy-2/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/20 blur-[100px] rounded-full"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[1100px] flex flex-col md:flex-row bg-navy/40 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden m-4"
      >
        {/* Left Side: Information/Branding */}
        <div className="hidden md:flex md:w-1/2 p-12 flex-col justify-between relative overflow-hidden bg-gradient-to-bl from-navy/50 to-transparent">
            <div className="relative z-10">
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="flex flex-col items-center gap-4 mb-8"
                >
                    <div className="w-48 h-auto flex items-center justify-center">
                        <img src="/logo-light.png" alt="موازين" className="w-full h-full object-contain" />
                    </div>
                </motion.div>
                
                <motion.h1 
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight"
                >
                    مرحباً بك في <br />
                    <span className="text-ink-2">الجيل القادم</span> من <br />
                    الإدارة القانونية
                </motion.h1>
                
                <motion.p 
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    className="text-gray-300 text-lg leading-relaxed max-w-md"
                >
                    منصة متكاملة تمنحك القوة والتحكم الكامل في قضاياك، عملائك، ومكتبك في مكان واحد وبكل سهولة.
                </motion.p>
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-4 text-gray-300">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <ShieldCheck size={18} className="text-ink-2" />
                    </div>
                    <span className="text-sm">نظام آمن ومشفر بالكامل لبياناتك</span>
                </div>
                <div className="flex items-center gap-4 text-gray-300">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <Gavel size={18} className="text-ink-2" />
                    </div>
                    <span className="text-sm">إدارة احترافية للجلسات والمواعيد</span>
                </div>
            </div>

            {/* Subtle background icon */}
            <Scale className="absolute -bottom-20 -left-20 text-white/5 w-80 h-80 -rotate-12" />
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-8 lg:p-16 bg-surface flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            <Link
              to="/"
              className="mb-7 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-gray-500 transition hover:bg-gray-100 hover:text-ink focus:outline-none focus:ring-2 focus:ring-edge/20"
            >
              <ArrowRight size={18} />
              العودة للصفحة الرئيسية
            </Link>
            <div className="mb-10 text-center md:text-right">
                <h2 className="text-3xl font-bold text-ink mb-2">تسجيل الدخول</h2>
                <p className="text-gray-500">الرجاء إدخال بياناتك للوصول إلى لوحة التحكم</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
                  >
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    {error}
                  </motion.div>
                )}
                {info && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl text-sm"
                  >
                    {info}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block mr-1">البريد الإلكتروني</label>
                <div className="relative group">
                  <User className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-ink transition-colors" size={20} />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pr-12 pl-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-edge/20 focus:border-edge transition-all"
                    placeholder="example@mail.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block mr-1">كلمة المرور</label>
                <div className="relative group">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-ink transition-colors" size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-12 pl-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-edge/20 focus:border-edge transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-ink transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-ink focus:ring-edge"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">تذكرني</span>
                </label>
                <button type="button" onClick={handleForgotPassword} className="text-sm font-semibold text-ink hover:underline">
                  نسيت كلمة المرور؟
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-navy text-ink-2 font-bold rounded-2xl shadow-xl shadow-navy/20 hover:bg-navy/90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 relative overflow-hidden"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-6 h-6 border-2 border-edge-2/30 border-t-edge-2 rounded-full"
                  />
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <ShieldCheck size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center text-sm text-gray-600">
              ليس لديك حساب؟{" "}
              <Link to="/signup" className="font-bold text-ink hover:underline">
                ابدأ تجربتك المجانية 14 يوماً
              </Link>
            </div>

            <div className="mt-8 text-center">
                <p className="text-gray-400 text-sm">
                    جميع الحقوق محفوظة &copy; {new Date().getFullYear()} موازين
                </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
