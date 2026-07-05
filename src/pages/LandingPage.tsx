import { Brain, CheckCircle2, Gavel, Globe, Lock, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

const FEATURES = [
  {
    title: "ذكاء اصطناعي قانوني",
    description: "يلخص القضايا ويحلل المستندات القانونية المعقدة بسرعة مع الحفاظ على السياق.",
    icon: <Brain className="text-[#D4AF37]" size={32} />,
  },
  {
    title: "إدارة شاملة للمكتب",
    description: "تحكم في الموكلين والقضايا والجلسات والحسابات من لوحة واحدة واضحة.",
    icon: <Gavel className="text-[#D4AF37]" size={32} />,
  },
  {
    title: "نظام SaaS متكامل",
    description: "مساحات عمل منفصلة وآمنة لكل محام مع دعم الفرق والمتدربين.",
    icon: <Globe className="text-[#D4AF37]" size={32} />,
  },
  {
    title: "أمان بيانات قوي",
    description: "تنظيم آمن للمستندات والبيانات الحساسة مع صلاحيات مناسبة لكل مستخدم.",
    icon: <Lock className="text-[#D4AF37]" size={32} />,
  },
];


function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A192F] text-white font-['Tajawal']" dir="rtl">
      <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-[#0A192F]/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <img src="/logo.png" alt="LawyerOS" className="h-12 w-auto" />
          <div className="hidden items-center gap-8 text-sm font-medium md:flex">
            <a href="#features" className="transition-colors hover:text-[#D4AF37]">المميزات</a>
            <a href="#services" className="transition-colors hover:text-[#D4AF37]">الخدمات</a>
            <a href="#ai" className="transition-colors hover:text-[#D4AF37]">الذكاء الاصطناعي</a>
            <Link to="/login" className="rounded-full bg-[#D4AF37] px-6 py-2 font-bold text-[#0A192F] transition hover:bg-[#D4AF37]/90">
              دخول النظام
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden px-6 pb-20 pt-32 lg:pb-28 lg:pt-44">
        <div className="absolute left-10 top-24 h-64 w-64 rounded-full bg-[#D4AF37]/10 blur-[100px]" />
        <div className="absolute bottom-10 right-10 h-80 w-80 rounded-full bg-blue-500/10 blur-[120px]" />

        <div className="relative z-10 mx-auto max-w-7xl text-center">
          <Badge className="mb-6 border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]">
            جيل جديد من الإدارة القانونية
          </Badge>
          <h1 className="mx-auto max-w-5xl text-4xl font-black leading-tight md:text-6xl lg:text-7xl">
            أدر مكتبك بذكاء مع قوة <span className="text-[#D4AF37]">الذكاء الاصطناعي</span>
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-lg leading-relaxed text-gray-300 md:text-xl">
            منصة متكاملة لإدارة مكاتب المحاماة تساعدك على تنظيم القضايا، الموكلين، الجلسات، المهام، والحسابات في مكان واحد.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/login" className="w-full rounded-2xl bg-[#D4AF37] px-10 py-5 text-center text-lg font-black text-[#0A192F] shadow-xl shadow-[#D4AF37]/20 transition hover:scale-105 sm:w-auto">
              ابدأ تجربتك
            </Link>
            <a href="#features" className="w-full rounded-2xl border border-white/15 px-10 py-5 text-center text-lg font-bold text-white transition hover:bg-white/10 sm:w-auto">
              شاهد المميزات
            </a>
          </div>

          <div className="mx-auto mt-20 max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
            <img
              src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=2070&auto=format&fit=crop"
              alt="Law office"
              className="aspect-[16/7] w-full rounded-2xl object-cover opacity-70"
            />
          </div>
        </div>
      </section>

      <section id="features" className="bg-white/[0.03] px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold">مميزات صممت للمحترفين</h2>
            <p className="mt-4 text-gray-400">كل ما تحتاجه لإدارة مكتبك القانوني بكفاءة.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-white/10 bg-white/5 p-8 transition hover:border-[#D4AF37]/40">
                <div className="mb-6 w-fit rounded-2xl bg-[#D4AF37]/10 p-4">{feature.icon}</div>
                <h3 className="mb-4 text-xl font-bold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai" className="px-6 py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <div>
            <Badge className="mb-6 border-purple-400/30 bg-purple-500/10 text-purple-300">
              قوة الذكاء الاصطناعي
            </Badge>
            <h2 className="text-4xl font-black leading-tight lg:text-5xl">
              اختصر ساعات القراءة والتحليل
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-gray-300">
              يساعدك LawyerOS على تلخيص المستندات واستخراج النقاط المهمة وتجهيز رؤية أسرع للقضية.
            </p>
            <div className="mt-8 space-y-4">
              {["تلخيص القضايا المعقدة", "استخراج النقاط القانونية", "تحليل نتائج الجلسات", "مساعد قانوني متاح دائماً"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="text-[#D4AF37]" size={20} />
                  <span className="font-bold">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[40px] border border-white/10 bg-white/5 p-8">
            <div className="space-y-6 rounded-[32px] bg-[#071225] p-8">
              <div className="flex gap-4 rounded-2xl border-r-4 border-purple-500 bg-white/5 p-4">
                <Brain className="shrink-0 text-purple-300" />
                <p className="text-sm">تم تحليل المستند واستخراج أهم النقاط القانونية خلال ثوان.</p>
              </div>
              <div className="mr-8 flex gap-4 rounded-2xl border-r-4 border-[#D4AF37] bg-white/5 p-4">
                <MessageSquare className="shrink-0 text-[#D4AF37]" />
                <p className="text-sm font-bold">اعرض لي التوصيات المناسبة لهذه القضية.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== SERVICES SECTION ===================== */}
      <section id="services" className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-20 text-center">
            <Badge className="mb-6 border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]">
              داخل النظام
            </Badge>
            <h2 className="text-4xl font-black leading-tight md:text-5xl">
              كل ما يحتاجه مكتبك <span className="text-[#D4AF37]">في مكان واحد</span>
            </h2>
            <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto">
              واجهة عربية احترافية مصممة خصيصاً للمحامين المصريين — من إدارة القضايا حتى تتبع الحسابات
            </p>
          </div>

          {/* Service 1: Cases */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#D4AF37]/10 text-[#D4AF37] px-4 py-2 rounded-full text-sm font-bold mb-6">
                ⚖️ إدارة القضايا
              </div>
              <h3 className="text-3xl font-black mb-6 leading-tight">
                سجّل قضاياك وتتبّع كل تفاصيلها بدقة
              </h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                منظومة متكاملة لإدارة ملفات القضايا — أضف قضايا جديدة، حدد الخصوم والموكلين، تابع الحالة القانونية، وابحث بسرعة في آلاف الملفات بلحظة واحدة.
              </p>
              <ul className="space-y-3">
                {["رقم القضية والمحكمة والدائرة", "ربط كل قضية بموكلها تلقائياً", "تصفية حسب الحالة: مفتوحة / مغلقة / معلقة", "عرض كامل لتفاصيل القضية والجلسات والمستندات"].map(item => (
                  <li key={item} className="flex items-start gap-3 text-gray-300">
                    <CheckCircle2 size={18} className="text-[#D4AF37] mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-[#D4AF37]/5 rounded-[40px] blur-2xl" />
              <img
                src="/screenshots/cases.png"
                alt="إدارة القضايا"
                className="relative rounded-2xl border border-white/10 shadow-2xl w-full"
              />
            </div>
          </div>

          {/* Service 2: Hearings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
            <div className="order-2 lg:order-1 relative">
              <div className="absolute -inset-4 bg-blue-500/5 rounded-[40px] blur-2xl" />
              <img
                src="/screenshots/hearings.png"
                alt="إدارة الجلسات"
                className="relative rounded-2xl border border-white/10 shadow-2xl w-full"
              />
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-300 px-4 py-2 rounded-full text-sm font-bold mb-6">
                📅 جدول الجلسات
              </div>
              <h3 className="text-3xl font-black mb-6 leading-tight">
                لا تفوّت موعداً واحداً مع جدول الجلسات الذكي
              </h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                تتبع مواعيد الجلسات لكل قضاياك في لوحة واضحة — سجل تاريخ الجلسة، المحكمة، الطلبات، وحمّل رول الجلسات كاملاً بضغطة واحدة للمحكمة.
              </p>
              <ul className="space-y-3">
                {["تحميل رول الجلسات PDF جاهز للمحكمة", "تنبيهات بالمواعيد القادمة", "ربط كل جلسة بقضيتها تلقائياً", "سجل كامل لكل جلسات كل قضية"].map(item => (
                  <li key={item} className="flex items-start gap-3 text-gray-300">
                    <CheckCircle2 size={18} className="text-blue-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Service 3: Accounting */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-24">
            <div>
              <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-300 px-4 py-2 rounded-full text-sm font-bold mb-6">
                💰 الحسابات المالية
              </div>
              <h3 className="text-3xl font-black mb-6 leading-tight">
                تحكم كامل في إيرادات ومصروفات مكتبك
              </h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                نظام محاسبي مبسّط مصمم للمحامين — سجّل الأتعاب والمدفوعات والمصروفات، واحصل على صورة مالية واضحة لمكتبك في أي وقت.
              </p>
              <ul className="space-y-3">
                {["تسجيل الأتعاب لكل قضية وموكل", "تتبع المدفوعات والمستحقات المتبقية", "إضافة مصروفات المكتب الشهرية", "ملخص مالي فوري: إجمالي الإيرادات والمصروفات"].map(item => (
                  <li key={item} className="flex items-start gap-3 text-gray-300">
                    <CheckCircle2 size={18} className="text-green-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-green-500/5 rounded-[40px] blur-2xl" />
              <img
                src="/screenshots/accounting.png"
                alt="الحسابات المالية"
                className="relative rounded-2xl border border-white/10 shadow-2xl w-full"
              />
            </div>
          </div>

          {/* Service 4: Login / Security */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="absolute -inset-4 bg-purple-500/5 rounded-[40px] blur-2xl" />
              <img
                src="/screenshots/login.png"
                alt="نظام الدخول الآمن"
                className="relative rounded-2xl border border-white/10 shadow-2xl w-full"
              />
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-300 px-4 py-2 rounded-full text-sm font-bold mb-6">
                🔒 أمان وخصوصية
              </div>
              <h3 className="text-3xl font-black mb-6 leading-tight">
                بياناتك محمية بأعلى معايير التشفير
              </h3>
              <p className="text-gray-400 text-lg leading-relaxed mb-8">
                كل مكتب له مساحة عمل منفصلة وآمنة تماماً — سجل دخول بالبريد الإلكتروني، صلاحيات مختلفة للمحامي والمتدرب، وبياناتك لا يراها أحد غيرك.
              </p>
              <ul className="space-y-3">
                {["تشفير كامل لجميع البيانات عبر Firebase", "مساحات عمل منفصلة لكل مكتب (SaaS)", "صلاحيات: محامي / متدرب / مدير", "لا مشاركة للبيانات بين المكاتب"].map(item => (
                  <li key={item} className="flex items-start gap-3 text-gray-300">
                    <CheckCircle2 size={18} className="text-purple-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>


      <footer className="border-t border-white/10 bg-[#0A192F] px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="LawyerOS" className="h-10 w-auto" />
            <p className="text-sm text-gray-500">© ٢٠٢٦ جميع الحقوق محفوظة لـ LawyerOS Pro</p>
          </div>
          <div className="flex items-center gap-8 text-sm text-gray-400">
            <a href="#" className="transition hover:text-white">سياسة الخصوصية</a>
            <a href="#" className="transition hover:text-white">شروط الاستخدام</a>
            <a href="#" className="transition hover:text-white">تواصل معنا</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
