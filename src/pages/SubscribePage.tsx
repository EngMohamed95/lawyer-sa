import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, ArrowRight, Phone, Mail, User, CreditCard, X, Loader2 } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";

const PLANS = [
  {
    key: "BASIC",
    name: "الباقة الأساسية",
    monthlyPrice: 200,
    annualPrice: 2000,
    features: ["إدارة الموكلين", "سجل القضايا", "مواعيد الجلسات", "دعم فني محدود"],
    color: "border-gray-200",
    badge: null,
  },
  {
    key: "PROFESSIONAL",
    name: "الباقة الاحترافية",
    monthlyPrice: 500,
    annualPrice: 5000,
    features: ["كل مميزات الأساسية", "المهام والمستندات", "الحسابات والتقارير", "إدارة المتدربين"],
    color: "border-[#D4AF37]",
    badge: "الأكثر طلباً",
  },
  {
    key: "PREMIUM",
    name: "باقة الشركات",
    monthlyPrice: 1000,
    annualPrice: 10000,
    features: ["كل مميزات الاحترافية", "المساعد الذكي AI", "مساحة تخزين أكبر", "دعم فني مخصص"],
    color: "border-blue-400",
    badge: null,
  },
];

const PLAN_NAMES: Record<string, string> = {
  BASIC: "الباقة الأساسية",
  PROFESSIONAL: "الباقة الاحترافية",
  PREMIUM: "باقة الشركات",
};

export default function SubscribePage() {
  const [searchParams] = useSearchParams();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<string>(searchParams.get("plan") || "");
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });

  const chosen = PLANS.find((p) => p.key === selectedPlan);
  const amount = chosen
    ? billing === "monthly"
      ? chosen.monthlyPrice
      : chosen.annualPrice
    : 0;

  const handleSelectPlan = (key: string) => {
    setSelectedPlan(key);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !form.name || !form.phone || !form.email) return;
    setIsSubmitting(true);

    try {
      // Save directly to Firestore
      await addDoc(collection(db, "subscriptionRequests"), {
        ...form,
        plan:      selectedPlan,
        planName:  PLAN_NAMES[selectedPlan],
        billing,
        amount,
        status:    "pending",
        createdAt: new Date().toISOString(),
      });

      // Best-effort WhatsApp notification via backend (won't block on failure)
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, plan: selectedPlan, planName: PLAN_NAMES[selectedPlan], billing, amount }),
      }).catch(() => {});

      setSubmitted(true);
      setShowForm(false);
    } catch (err: any) {
      alert("حدث خطأ: " + (err?.message || "حاول مرة أخرى أو تواصل معنا على واتساب"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A192F] text-white font-['Tajawal']" dir="rtl">
      <nav className="border-b border-white/10 bg-[#0A192F]/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <Link to="/">
          <img src="/logo.png" alt="LawyerOS" className="h-10 w-auto" />
        </Link>
        <Link to="/login" className="text-sm text-gray-300 hover:text-white flex items-center gap-2">
          <ArrowRight size={16} />
          تسجيل الدخول
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black mb-4">اختر باقتك</h1>
          <p className="text-gray-400 text-lg">بادئ اشتراكك واستمتع بإدارة مكتبك بكل سهولة</p>

          <div className="inline-flex items-center bg-white/10 rounded-2xl p-1 mt-8">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${billing === "monthly" ? "bg-[#D4AF37] text-[#0A192F]" : "text-gray-300"}`}
            >
              شهري
            </button>
            <button
              onClick={() => setBilling("annual")}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${billing === "annual" ? "bg-[#D4AF37] text-[#0A192F]" : "text-gray-300"}`}
            >
              سنوي
              <span className="mr-2 bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">وفر 17%</span>
            </button>
          </div>
        </div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto text-center bg-white/5 border border-green-500/30 rounded-3xl p-12"
          >
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 size={40} className="text-green-400" />
            </div>
            <h2 className="text-2xl font-black mb-4">تم استلام طلبك!</h2>
            <p className="text-gray-300 mb-6">
              سيتواصل معك فريقنا خلال 24 ساعة لتأكيد الاشتراك وتفعيل حسابك.
            </p>
            <div className="bg-white/5 rounded-2xl p-6 text-right space-y-2 mb-8">
              <p className="text-sm font-bold text-[#D4AF37] mb-3">تفاصيل الدفع:</p>
              <p className="text-sm text-gray-300">الباقة: <span className="text-white font-bold">{PLAN_NAMES[selectedPlan]}</span></p>
              <p className="text-sm text-gray-300">المبلغ: <span className="text-white font-bold">{amount} ج.م / {billing === "monthly" ? "شهر" : "سنة"}</span></p>
              <p className="text-sm text-gray-300 mt-4">يمكنك الدفع عبر:</p>
              <p className="text-sm text-white font-bold">📱 فودافون كاش / إنستاباي: 01094040671</p>
            </div>
            <a
              href={`https://wa.me/201094040671?text=${encodeURIComponent(`مرحباً، أرسلت طلب اشتراك ${PLAN_NAMES[selectedPlan]} وأريد التأكيد`)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-4 rounded-2xl transition"
            >
              📞 تواصل معنا على واتساب
            </a>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <motion.div
                key={plan.key}
                whileHover={{ y: -4 }}
                className={`relative rounded-[28px] border-2 p-8 bg-white/5 transition-all ${
                  plan.badge ? "border-[#D4AF37] scale-105 shadow-xl shadow-[#D4AF37]/10" : plan.color
                } ${selectedPlan === plan.key ? "ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#0A192F]" : ""}`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-[#0A192F] text-xs font-black px-4 py-1.5 rounded-full whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-xl font-black mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-black">
                    {billing === "monthly" ? plan.monthlyPrice : plan.annualPrice}
                  </span>
                  <span className="text-gray-400 text-sm mr-1">
                    ج.م / {billing === "monthly" ? "شهر" : "سنة"}
                  </span>
                  {billing === "annual" && (
                    <p className="text-green-400 text-xs mt-1">
                      يعادل {Math.round(plan.annualPrice / 12)} ج.م/شهر
                    </p>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <CheckCircle2 size={16} className="text-[#D4AF37] shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan(plan.key)}
                  className={`w-full py-3 rounded-2xl font-black text-sm transition ${
                    plan.badge
                      ? "bg-[#D4AF37] text-[#0A192F] hover:bg-[#B8962E]"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  اشترك الآن
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && chosen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#0A192F] border border-white/20 rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-black">تفاصيل الاشتراك</h2>
                  <p className="text-sm text-[#D4AF37] font-bold mt-1">
                    {chosen.name} — {amount} ج.م / {billing === "monthly" ? "شهر" : "سنة"}
                  </p>
                </div>
                <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <User size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    required
                    placeholder="الاسم الكامل"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:border-[#D4AF37] text-white placeholder-gray-500"
                  />
                </div>
                <div className="relative">
                  <Phone size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    required
                    placeholder="رقم الهاتف (واتساب)"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:border-[#D4AF37] text-white placeholder-gray-500"
                  />
                </div>
                <div className="relative">
                  <Mail size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    required
                    type="email"
                    placeholder="البريد الإلكتروني"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:border-[#D4AF37] text-white placeholder-gray-500"
                  />
                </div>

                <div className="bg-white/5 rounded-2xl p-4 text-sm text-gray-400">
                  <p className="flex items-center gap-2 mb-1">
                    <CreditCard size={14} className="text-[#D4AF37]" />
                    <span className="font-bold text-white">طريقة الدفع</span>
                  </p>
                  <p>فودافون كاش / إنستاباي: <span className="text-white font-bold">01094040671</span></p>
                  <p className="mt-1 text-xs">بعد الدفع سيتم تفعيل حسابك خلال 24 ساعة</p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#D4AF37] hover:bg-[#B8962E] text-[#0A192F] font-black py-4 rounded-2xl transition flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "إرسال طلب الاشتراك"
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
