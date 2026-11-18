import { Brain, Briefcase, CalendarDays, CheckCircle2, Gavel, Globe, Lock, MessageSquare, ReceiptText, Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

const FEATURES = [
  {
    title: "ذكاء اصطناعي قانوني",
    description: "يلخص القضايا ويحلل المستندات القانونية المعقدة بسرعة مع الحفاظ على السياق.",
    icon: <Brain className="text-ink-2" size={32} />,
  },
  {
    title: "إدارة شاملة للمكتب",
    description: "تحكم في العملاء والقضايا والجلسات والحسابات من لوحة واحدة واضحة.",
    icon: <Gavel className="text-ink-2" size={32} />,
  },
  {
    title: "نظام SaaS متكامل",
    description: "مساحات عمل منفصلة وآمنة لكل محام مع دعم الفرق والمتدربين.",
    icon: <Globe className="text-ink-2" size={32} />,
  },
  {
    title: "أمان بيانات قوي",
    description: "تنظيم آمن للمستندات والبيانات الحساسة مع صلاحيات مناسبة لكل مستخدم.",
    icon: <Lock className="text-ink-2" size={32} />,
  },
];


/** أقسام «داخل النظام» — صور من مكتب العرض (بيانات وهمية) بالهوية الجديدة */
const MODULES = [
  {
    image: "/screenshots/cases.webp",
    alt: "إدارة القضايا في موازين",
    badge: "إدارة القضايا",
    icon: <Briefcase size={16} />,
    badgeClass: "bg-[#c9a227]/10 text-[#e6c766]",
    checkClass: "text-[#e6c766]",
    glowClass: "bg-[#c9a227]/10",
    title: "كل قضاياك منظمة وفي متناول يدك",
    description: "سجّل القضية مرة واحدة وتابع أطرافها ومحكمتها ودائرتها ومراحلها والمحامي المسؤول عنها — بالتاريخ الهجري والميلادي.",
    points: ["رقم القضية والمحكمة والدائرة وصفة الموكّل", "تكليف المحامين والمستشارين والمتدربين", "مراحل التقاضي ونسبة الإنجاز لكل قضية", "تصدير سجل القضايا إلى Excel"],
  },
  {
    image: "/screenshots/hearings.webp",
    alt: "جدول الجلسات في موازين",
    badge: "الجلسات",
    icon: <Gavel size={16} />,
    badgeClass: "bg-blue-500/10 text-blue-300",
    checkClass: "text-blue-400",
    glowClass: "bg-blue-500/10",
    title: "لا تفوّت جلسة واحدة",
    description: "كل جلسات المكتب في جدول واحد: القادمة، واليوم، والتي تنتظر تسجيل نتيجتها — مع رول الجلسات جاهزاً للطباعة.",
    points: ["حالة كل جلسة: قادمة / اليوم / بانتظار النتيجة / منتهية", "تحميل رول الجلسات PDF بضغطة", "ربط الجلسة بقضيتها ومحاميها تلقائياً", "تسجيل القرار والمطلوب للجلسة التالية"],
  },
  {
    image: "/screenshots/calendar.webp",
    alt: "التقويم والمواعيد في موازين",
    badge: "المواعيد والتقويم",
    icon: <CalendarDays size={16} />,
    badgeClass: "bg-emerald-500/10 text-emerald-300",
    checkClass: "text-emerald-400",
    glowClass: "bg-emerald-500/10",
    title: "يومك كله في تقويم واحد",
    description: "الجلسات والمواعيد والمهام ومواعيد الفواتير والعقود تجتمع في تقويم شهري وأسبوعي ويومي، مع تذكيرات قبل كل موعد.",
    points: ["عرض شهري وأسبوعي ويومي وأجندة", "اجتماعات العملاء والاستشارات ومواعيد الإجراءات", "تذكيرات داخل النظام قبل الموعد", "تصدير التقويم إلى Google وOutlook"],
  },
  {
    image: "/screenshots/execution.webp",
    alt: "ملفات التنفيذ في موازين",
    badge: "التنفيذ",
    icon: <Scale size={16} />,
    badgeClass: "bg-orange-500/10 text-orange-300",
    checkClass: "text-orange-400",
    glowClass: "bg-orange-500/10",
    title: "تابع طلبات التنفيذ حتى التحصيل",
    description: "قسم مستقل لطلبات التنفيذ: نوع السند، والمنفذ ضده، والمبالغ المحصّلة، ومهلة التنفيذ، ونسبة إنجاز كل ملف.",
    points: ["السندات لأمر والشيكات والأحكام والعقود", "تنبيه الملفات الناقصة والتي تجاوزت المهلة", "خطوات التنفيذ ونسبة الإنجاز لكل ملف", "سجل المبالغ المحصّلة من المنفذ ضده"],
  },
  {
    image: "/screenshots/invoices.webp",
    alt: "الفواتير والتحصيل في موازين",
    badge: "الفواتير والحسابات",
    icon: <ReceiptText size={16} />,
    badgeClass: "bg-green-500/10 text-green-300",
    checkClass: "text-green-400",
    glowClass: "bg-green-500/10",
    title: "فوترة احترافية وتحصيل بلا ضياع",
    description: "أصدر الفواتير بضريبة القيمة المضافة، واعتمدها وأرسلها للعميل، وتابع المحصَّل والمتبقي والمتأخر في لوحة واحدة.",
    points: ["فواتير ضريبية مرتبطة بالعميل والقضية", "سندات القبض والصرف والمصروفات", "المحصَّل والمستحق والمتأخر لحظة بلحظة", "كشف حساب لكل عميل"],
  },
  {
    image: "/screenshots/login.webp",
    alt: "الدخول الآمن إلى موازين",
    badge: "أمان وخصوصية",
    icon: <Lock size={16} />,
    badgeClass: "bg-purple-500/10 text-purple-300",
    checkClass: "text-purple-400",
    glowClass: "bg-purple-500/10",
    title: "بيانات مكتبك لمكتبك وحده",
    description: "كل مكتب في مساحة معزولة تماماً، ولكل عضو في الفريق صلاحيات تناسب دوره — والمحامي يرى القضايا المكلّف بها فقط.",
    points: ["عزل كامل لبيانات كل مكتب", "أدوار: مدير مكتب، محامٍ، مستشار، متدرب، محاسب", "تأكيد البريد الإلكتروني برمز عند التسجيل", "سجل تدقيق لكل عملية داخل المكتب"],
  },
];

/** صورة شاشة داخل إطار متصفح بسيط */
function ScreenFrame({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1733] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2.5" dir="ltr">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        <span className="mx-auto rounded-md bg-white/5 px-6 py-0.5 text-[11px] text-gray-400">mawazzen.com</span>
      </div>
      <img src={src} alt={alt} width={1440} height={900} loading={eager ? "eager" : "lazy"} decoding="async" className="block w-full" />
    </div>
  );
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-4 py-2 text-xs font-bold ${className}`}>
      {children}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-navy text-white font-['Tajawal']" dir="rtl">
      <nav className="fixed top-0 z-50 w-full border-b border-white/10 bg-navy/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <img src="/logo-light.png" alt="موازين" className="h-12 w-auto" />
          <div className="hidden items-center gap-8 text-sm font-medium md:flex">
            <a href="#features" className="transition-colors hover:text-ink-2">المميزات</a>
            <a href="#services" className="transition-colors hover:text-ink-2">الخدمات</a>
            <a href="#ai" className="transition-colors hover:text-ink-2">الذكاء الاصطناعي</a>
            <Link to="/login" className="transition-colors hover:text-ink-2">
              دخول النظام
            </Link>
            <Link to="/signup" className="rounded-full bg-navy-2 px-6 py-2 font-bold text-ink transition hover:bg-navy-2/90">
              جرّب مجاناً
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden px-6 pb-20 pt-32 lg:pb-28 lg:pt-44">
        <div className="absolute left-10 top-24 h-64 w-64 rounded-full bg-navy-2/10 blur-[100px]" />
        <div className="absolute bottom-10 right-10 h-80 w-80 rounded-full bg-blue-500/10 blur-[120px]" />

        <div className="relative z-10 mx-auto max-w-7xl text-center">
          <Badge className="mb-6 border-edge-2/30 bg-navy-2/10 text-ink-2">
            جيل جديد من الإدارة القانونية
          </Badge>
          <h1 className="mx-auto max-w-5xl text-4xl font-black leading-tight md:text-6xl lg:text-7xl">
            أدر مكتبك بذكاء مع قوة <span className="text-ink-2">الذكاء الاصطناعي</span>
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-lg leading-relaxed text-gray-300 md:text-xl">
            منصة متكاملة لإدارة مكاتب المحاماة تساعدك على تنظيم القضايا، العملاء، الجلسات، المهام، والحسابات في مكان واحد.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link to="/signup" className="w-full rounded-2xl bg-navy-2 px-10 py-5 text-center text-lg font-black text-ink shadow-xl shadow-navy-2/20 transition hover:scale-105 sm:w-auto">
              ابدأ تجربتك المجانية 14 يوماً
            </Link>
            <a href="#features" className="w-full rounded-2xl border border-white/15 px-10 py-5 text-center text-lg font-bold text-white transition hover:bg-white/10 sm:w-auto">
              شاهد المميزات
            </a>
          </div>

          <div className="relative mx-auto mt-20 max-w-6xl">
            <div className="absolute -inset-6 rounded-[48px] bg-gradient-to-b from-[#c9a227]/20 via-blue-500/10 to-transparent blur-3xl" />
            <ScreenFrame src="/screenshots/dashboard.webp" alt="لوحة تحكم موازين — ملخص القضايا والجلسات والمهام والفواتير" eager />
          </div>
        </div>
      </section>

      <section id="features" className="bg-surface/[0.03] px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <h2 className="text-4xl font-bold">مميزات صممت للمحترفين</h2>
            <p className="mt-4 text-gray-400">كل ما تحتاجه لإدارة مكتبك القانوني بكفاءة.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-white/10 bg-white/5 p-8 transition hover:border-edge-2/40">
                <div className="mb-6 w-fit rounded-2xl bg-navy-2/10 p-4">{feature.icon}</div>
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
              يساعدك موازين على تلخيص المستندات واستخراج النقاط المهمة وتجهيز رؤية أسرع للقضية.
            </p>
            <div className="mt-8 space-y-4">
              {["تلخيص القضايا المعقدة", "استخراج النقاط القانونية", "تحليل نتائج الجلسات", "مساعد قانوني متاح دائماً"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="text-ink-2" size={20} />
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
              <div className="mr-8 flex gap-4 rounded-2xl border-r-4 border-edge-2 bg-white/5 p-4">
                <MessageSquare className="shrink-0 text-ink-2" />
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
            <Badge className="mb-6 border-edge-2/30 bg-navy-2/10 text-ink-2">
              داخل النظام
            </Badge>
            <h2 className="text-4xl font-black leading-tight md:text-5xl">
              كل ما يحتاجه مكتبك <span className="text-ink-2">في مكان واحد</span>
            </h2>
            <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto">
              واجهة عربية احترافية مصممة للمحامين — من القضية الأولى حتى تحصيل آخر فاتورة
            </p>
          </div>

          <div className="space-y-24 lg:space-y-32">
            {MODULES.map((m, i) => (
              <div key={m.image} className="grid grid-cols-1 items-center gap-12 lg:grid-cols-5">
                <div className={`lg:col-span-2 ${i % 2 ? "lg:order-2" : ""}`}>
                  <div className={`mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${m.badgeClass}`}>
                    {m.icon} {m.badge}
                  </div>
                  <h3 className="mb-6 text-3xl font-black leading-tight">{m.title}</h3>
                  <p className="mb-8 text-lg leading-relaxed text-gray-400">{m.description}</p>
                  <ul className="space-y-3">
                    {m.points.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-gray-300">
                        <CheckCircle2 size={18} className={`mt-0.5 shrink-0 ${m.checkClass}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`relative lg:col-span-3 ${i % 2 ? "lg:order-1" : ""}`}>
                  <div className={`absolute -inset-4 rounded-[40px] blur-2xl ${m.glowClass}`} />
                  <ScreenFrame src={m.image} alt={m.alt} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-navy px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-4">
            <img src="/logo-light.png" alt="موازين" className="h-10 w-auto" />
            <p className="text-sm text-gray-400">© ٢٠٢٦ جميع الحقوق محفوظة لـ موازين</p>
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
