import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Lock, User, Eye, EyeOff, ShieldCheck, Scale, Gavel } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const { auth, db } = await import("../lib/firebase");
      const { doc, getDoc } = await import("firebase/firestore");
      
      const userCredential = await signInWithEmailAndPassword(auth, username, password);
      const firebaseUser = userCredential.user;
      
      // Fetch user role and info from Firestore
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (!userDoc.exists()) {
          throw new Error("لم يتم العثور على حساب لهذا المستخدم في قاعدة البيانات.");
      }
      
      const userData = userDoc.data();
      const role = userData?.role || "TRAINEE";
      let plan = userData?.plan || "BASIC";

      // SaaS Tenancy Logic:
      let lawyerId = null;
      if (role === "LAWYER") {
          lawyerId = firebaseUser.uid;
      } else if (role === "TRAINEE") {
          lawyerId = userData.lawyerId; 
          // Fetch Lawyer's plan for the Trainee
          const lawyerDoc = await getDoc(doc(db, "users", lawyerId));
          if (lawyerDoc.exists()) {
            plan = lawyerDoc.data().plan || "BASIC";
          }
      } else if (role === "SUPER_ADMIN") {
          lawyerId = "ALL"; 
          plan = "PREMIUM";
      }
      
      // Check subscription expiry
      if (role === "LAWYER" && userData?.subscriptionExpiry) {
        const expiry = new Date(userData.subscriptionExpiry);
        if (expiry < new Date()) {
          plan = "BASIC";
          const { updateDoc, doc: firestoreDoc } = await import("firebase/firestore");
          await updateDoc(firestoreDoc(db, "users", firebaseUser.uid), { plan: "BASIC" });
        }
        localStorage.setItem("subscriptionExpiry", userData.subscriptionExpiry);
      }

      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userRole", role);
      localStorage.setItem("userPlan", plan);
      localStorage.setItem("userName", userData?.name || firebaseUser.email?.split('@')[0] || "مستخدم");
      localStorage.setItem("userId", firebaseUser.uid);
      localStorage.setItem("lawyerId", lawyerId || "");
      
      navigate("/app");
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

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#0A192F] font-['Tajawal']" dir="rtl">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-[20s] hover:scale-105"
        style={{ 
          backgroundImage: `url('https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=2070&auto=format&fit=crop')`,
        }}
      >
        {/* Adjusted overlay to make the image visible on the entire page */}
        <div className="absolute inset-0 bg-[#0A192F]/60 backdrop-blur-[2px]"></div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#D4AF37]/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-blue-500/20 blur-[100px] rounded-full"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[1100px] flex flex-col md:flex-row bg-[#0A192F]/40 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden m-4"
      >
        {/* Left Side: Information/Branding */}
        <div className="hidden md:flex md:w-1/2 p-12 flex-col justify-between relative overflow-hidden bg-gradient-to-bl from-[#0A192F]/50 to-transparent">
            <div className="relative z-10">
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="flex flex-col items-center gap-4 mb-8"
                >
                    <div className="w-48 h-auto flex items-center justify-center">
                        <img src="/logo.png" alt="LawyerOS" className="w-full h-full object-contain" />
                    </div>
                </motion.div>
                
                <motion.h1 
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight"
                >
                    مرحباً بك في <br />
                    <span className="text-[#D4AF37]">الجيل القادم</span> من <br />
                    الإدارة القانونية
                </motion.h1>
                
                <motion.p 
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    className="text-gray-300 text-lg leading-relaxed max-w-md"
                >
                    منصة متكاملة تمنحك القوة والتحكم الكامل في قضاياك، موكليك، ومكتبك في مكان واحد وبكل سهولة.
                </motion.p>
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-4 text-gray-300">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <ShieldCheck size={18} className="text-[#D4AF37]" />
                    </div>
                    <span className="text-sm">نظام آمن ومشفر بالكامل لبياناتك</span>
                </div>
                <div className="flex items-center gap-4 text-gray-300">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <Gavel size={18} className="text-[#D4AF37]" />
                    </div>
                    <span className="text-sm">إدارة احترافية للجلسات والمواعيد</span>
                </div>
            </div>

            {/* Subtle background icon */}
            <Scale className="absolute -bottom-20 -left-20 text-white/5 w-80 h-80 -rotate-12" />
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-8 lg:p-16 bg-white flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            <div className="mb-10 text-center md:text-right">
                <h2 className="text-3xl font-bold text-[#0A192F] mb-2">تسجيل الدخول</h2>
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
              </AnimatePresence>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block mr-1">البريد الإلكتروني</label>
                <div className="relative group">
                  <User className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#0A192F] transition-colors" size={20} />
                  <input
                    type="email"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pr-12 pl-4 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/20 focus:border-[#0A192F] transition-all"
                    placeholder="example@mail.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block mr-1">كلمة المرور</label>
                <div className="relative group">
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#0A192F] transition-colors" size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-12 pl-12 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/20 focus:border-[#0A192F] transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A192F] transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-[#0A192F] focus:ring-[#0A192F]" />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">تذكرني</span>
                </label>
                <button type="button" className="text-sm font-semibold text-[#0A192F] hover:underline">
                  نسيت كلمة المرور؟
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-[#0A192F] text-[#D4AF37] font-bold rounded-2xl shadow-xl shadow-[#0A192F]/20 hover:bg-[#0A192F]/90 active:scale-[0.98] transition-all flex items-center justify-center gap-3 relative overflow-hidden"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-6 h-6 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full"
                  />
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <ShieldCheck size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-12 text-center">
                <p className="text-gray-400 text-sm">
                    جميع الحقوق محفوظة &copy; {new Date().getFullYear()} LawyerOS Pro
                </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
