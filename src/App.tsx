import { BrowserRouter as Router, Routes, Route, Outlet, Link, useLocation, Navigate, useNavigate } from "react-router";
import { LayoutDashboard, Users, Briefcase, Calendar, CheckSquare, FileText, Settings, Bell, Search, Menu, Calculator, GraduationCap, BarChart, LogOut, Shield, CreditCard, Loader2, BookOpen, Sparkles, ChevronDown, ScrollText, Trash2, FileSignature, ReceiptText, Handshake, Timer, CalendarDays, Globe } from "lucide-react";
import { useState, lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { collection, getDocs, query, where, collectionGroup, limit } from "firebase/firestore";
import { db } from "./lib/firebase";
import { usePermissions } from "./lib/usePermissions";
import { generateNotifications, loadPreferences, shouldAutoScan } from "./lib/notifications";
import { clearLocalSession, useAuthSession } from "./lib/useAuthSession";
import { loadOfficeSettings } from "./lib/officeSettings";
import { loadOfficeLookups } from "./lib/officeLookups";
import { roleLabel } from "./lib/roles";
import { motion, AnimatePresence } from "framer-motion";

// Standard Import for Critical Pages (Faster initial load)
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import CreateAdmin from "./pages/CreateAdmin";

// أمان: مسار إنشاء المدير العام معطّل افتراضياً.
// كان مفتوحاً للجميع، فكان بإمكان أي زائر إنشاء حساب SUPER_ADMIN لنفسه.
// لتفعيله مؤقتاً: ضع VITE_ENABLE_CREATE_ADMIN=true في .env ثم أعده إلى false فوراً بعد الاستخدام.
const CREATE_ADMIN_ENABLED = import.meta.env.VITE_ENABLE_CREATE_ADMIN === "true";

/** عنصر في القائمة الجانبية — قد يحتوي قائمة فرعية */
interface NavItem {
  name: string;
  path: string;
  icon: ReactNode;
  hidden?: boolean;
  children?: NavItem[];
}

// Lazy Loading for Dashboard & App Pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Cases = lazy(() => import("./pages/Cases"));
const CaseDetails = lazy(() => import("./pages/CaseDetails"));
const Hearings = lazy(() => import("./pages/Hearings"));
const HearingDetails = lazy(() => import("./pages/HearingDetails"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Documents = lazy(() => import("./pages/Documents"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Trainees = lazy(() => import("./pages/Trainees"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Lawyers = lazy(() => import("./pages/Lawyers"));
const SubscriptionRequests = lazy(() => import("./pages/SubscriptionRequests"));
const SubscribePage = lazy(() => import("./pages/SubscribePage"));
const LegalLibrary = lazy(() => import("./pages/LegalLibrary"));
const OfficeLawyers = lazy(() => import("./pages/OfficeLawyers"));
const Consultants = lazy(() => import("./pages/Consultants"));
const Team = lazy(() => import("./pages/Team"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const RecycleBin = lazy(() => import("./pages/RecycleBin"));
const Contracts = lazy(() => import("./pages/Contracts"));
const Invoices = lazy(() => import("./pages/Invoices"));
const FeeAgreements = lazy(() => import("./pages/FeeAgreements"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const NotificationsPage = lazy(() => import("./pages/Notifications"));
const ClientPortalAdmin = lazy(() => import("./pages/ClientPortalAdmin"));
const TimeEntries = lazy(() => import("./pages/TimeEntries"));
const AiChat = lazy(() => import("./pages/AiChat"));

function Sidebar({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const perms = usePermissions();

  // بوابة الباقة منفصلة تماماً عن بوابة الدور: الدور يحدد "هل يحق له"،
  // والباقة تحدد "هل اشترك فيها". الشرطان يبقيان كما كانا بالضبط.
  const plan = localStorage.getItem("userPlan");
  const isBasic = plan === "BASIC";
  const isPremium = plan === "PREMIUM";

  // حجب باقة BASIC للمهام والمستندات كان — ولا يزال — مقصوراً على LAWYER
  // و OFFICE_LAWYER دون المتدرب. سلوك قائم نحافظ عليه حرفياً.
  const paidRoleOnBasic = isBasic && (perms.role === "LAWYER" || perms.role === "OFFICE_LAWYER");

  // التقارير: صفحة التقارير الحالية تعرض أرقام المكتب كاملة (قضايا + أداء
  // محامين + مالية) بلا أي تصفية. فحتى تُنفَّذ نطاقات OWN و FINANCIAL في
  // الميزة 013، نقصرها على من يملك "كامل" فقط.
  // هذا يطابق سلوك النظام اليوم، ويمنع المحاسب من رؤية بيانات القضايا
  // (فصل الصلاحيات المالية عن القانونية — الوثيقة §خامساً).
  const canSeeFullReports = perms.scopeOf("report.view") === "FULL";

  const navItems: NavItem[] = [
    { name: "لوحة التحكم", path: "/app/dashboard", icon: <LayoutDashboard size={20} /> },
    { name: "المحامين", path: "/app/lawyers", icon: <Shield size={20} />, hidden: !perms.can("platform.manage") },
    { name: "الاشتراكات", path: "/app/subscriptions", icon: <CreditCard size={20} />, hidden: !perms.can("platform.manage") },

    // العملاء تضم بوابة العملاء كقائمة فرعية
    {
      name: "العملاء",
      path: "/app/clients",
      icon: <Users size={20} />,
      hidden: !perms.can("client.manage"),
      children: [
        { name: "بوابة العملاء", path: "/app/client-portal", icon: <Globe size={18} />, hidden: !perms.can("client.manage") },
      ],
    },

    // ── العمل القضائي: القضية هي الجذر، وتحتها ما يتفرّع عنها ──
    // شرط الإخفاء لكل عنصر لم يتغيّر حرفاً واحداً؛ التغيير في الترتيب فقط.
    // ولو أُخفي الأب وظهر أبناؤه (العميل مثلاً يرى الجلسات ولا يرى القضايا)
    // يرفعهم visibleNavItems للمستوى الأعلى فلا يفقد أحد وصولاً كان يملكه.
    {
      name: "القضايا",
      path: "/app/cases",
      icon: <Briefcase size={20} />,
      hidden: !perms.can("case.update"),
      children: [
        { name: "الجلسات", path: "/app/hearings", icon: <Calendar size={18} />, hidden: !perms.can("hearing.manage") },
        { name: "المواعيد والتقويم", path: "/app/calendar", icon: <CalendarDays size={18} />, hidden: !perms.can("appointment.manage") },
        { name: "المهام", path: "/app/tasks", icon: <CheckSquare size={18} />, hidden: !perms.can("task.manage") || paidRoleOnBasic },
        { name: "المستندات", path: "/app/documents", icon: <FileText size={18} />, hidden: !perms.can("document.manage") || paidRoleOnBasic },
      ],
    },

    { name: "العقود", path: "/app/contracts", icon: <FileSignature size={20} />, hidden: !perms.can("contract.manage") },

    // ── المالية: الحسابات هي الجذر، وتحتها الفوترة والأتعاب والساعات ──
    {
      name: "الحسابات",
      path: "/app/accounting",
      icon: <Calculator size={20} />,
      hidden: !perms.can("finance.manage") || isBasic,
      children: [
        { name: "الفواتير", path: "/app/invoices", icon: <ReceiptText size={18} />, hidden: !perms.can("invoice.manage") },
        { name: "اتفاقيات الأتعاب", path: "/app/fee-agreements", icon: <Handshake size={18} />, hidden: !perms.can("invoice.manage") },
        { name: "تسجيل الساعات", path: "/app/time-entries", icon: <Timer size={18} />, hidden: !perms.can("invoice.manage") },
      ],
    },

    // ── فريق المكتب ──
    {
      name: "فريق المكتب",
      path: "/app/team",
      icon: <Users size={20} />,
      hidden: !perms.can("users.manage"),
      children: [
        { name: "المتدربين", path: "/app/trainees", icon: <GraduationCap size={18} />, hidden: !perms.can("trainee.manage") || isBasic },
        { name: "محامو المكتب", path: "/app/office-lawyers", icon: <Shield size={18} />, hidden: !perms.can("officelawyer.manage") || isBasic },
        { name: "المستشارون", path: "/app/consultants", icon: <Shield size={18} />, hidden: !perms.can("consultant.manage") || isBasic },
      ],
    },

    // ── التقارير والأدوات ──
    { name: "التقارير", path: "/app/reports", icon: <BarChart size={20} />, hidden: !canSeeFullReports || !isPremium },
    { name: "المساعد الذكي", path: "/app/ai-chat", icon: <Sparkles size={20} />, hidden: !perms.can("ai.use") || !isPremium },
    { name: "المكتبة القانونية", path: "/app/library", icon: <BookOpen size={20} />, hidden: !perms.can("library.view") },

    // ── إدارة النظام ──
    // سجل التدقيق وسلة المحذوفات انتقلا إلى تبويبين داخل الإعدادات لتخفيف
    // ازدحام القائمة. مساراهما /app/audit-log و /app/recycle-bin ما زالا
    // يعملان، فأي رابط محفوظ أو انتقال برمجي لا ينكسر.
  ];

  // لو كان عنصر الأب مخفياً وله أبناء ظاهرون، نرفع الأبناء للمستوى الأعلى
  // حتى لا يفقد أي دور وصولاً كان يملكه (الشريك مثلاً يرى المتدربين
  // ومحامي المكتب لكنه لا يملك إدارة المستخدمين).
  const visibleNavItems = navItems.flatMap((item) => {
    const kids = (item.children ?? []).filter((c) => !c.hidden);
    if (item.hidden) return kids.map((c) => ({ ...c, children: undefined }));
    return [{ ...item, children: kids }];
  });

  const [openGroups, setOpenGroups] = useState<string[]>([]);

  // تُفتح المجموعة تلقائياً عند الدخول لأحد أبنائها، ويبقى للمستخدم حق طيّها
  useEffect(() => {
    const parent = navItems.find((i) => (i.children ?? []).some((c) => c.path === location.pathname));
    if (parent) setOpenGroups((g) => (g.includes(parent.path) ? g : [...g, parent.path]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (path: string) =>
    setOpenGroups((g) => (g.includes(path) ? g.filter((p) => p !== path) : [...g, path]));

  const isGroupOpen = (path: string) => openGroups.includes(path);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
        onClick={onClose}
      />
      
      <aside className={`fixed md:sticky top-0 right-0 h-screen w-64 bg-[#133B2E] text-white flex flex-col shadow-2xl transition-transform duration-300 z-50 md:translate-x-0 ${isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        <div className="p-8 flex flex-col items-center border-b border-white/10 relative">
          <button onClick={onClose} className="md:hidden absolute top-4 left-4 text-white/70 hover:text-white">
            <Menu size={24} />
          </button>
          <Link to="/" onClick={onClose}>
              <img src="/logo.png" alt="LawyerOS" className="w-40 h-auto object-contain" />
          </Link>
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1">
            {visibleNavItems.map((item) => {
              const kids = (item.children ?? []).filter(c => !c.hidden);
              const isActive = location.pathname === item.path;

              // لا قائمة فرعية ← عنصر عادي كما كان تماماً
              if (kids.length === 0) {
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-6 py-3 transition-all duration-200 ${
                        isActive
                          ? "bg-[#D4AF37]/20 text-[#D4AF37] border-r-4 border-[#D4AF37] font-bold"
                          : "hover:bg-white/5 text-gray-300 hover:text-white"
                      }`}
                    >
                      {item.icon}
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              }

              const expanded = isGroupOpen(item.path);
              return (
                <li key={item.path}>
                  <div
                    className={`flex items-center transition-all duration-200 ${
                      isActive
                        ? "bg-[#D4AF37]/20 text-[#D4AF37] border-r-4 border-[#D4AF37] font-bold"
                        : "hover:bg-white/5 text-gray-300 hover:text-white"
                    }`}
                  >
                    <Link to={item.path} onClick={onClose} className="flex items-center gap-3 px-6 py-3 flex-1 min-w-0">
                      {item.icon}
                      <span className="font-medium truncate">{item.name}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.path)}
                      aria-expanded={expanded}
                      aria-label={expanded ? `طيّ ${item.name}` : `توسيع ${item.name}`}
                      className="px-4 py-3 text-current opacity-70 hover:opacity-100 shrink-0"
                    >
                      <ChevronDown size={16} className={`transition-transform ${expanded ? "" : "rotate-90"}`} />
                    </button>
                  </div>

                  {expanded && (
                    <ul className="bg-black/15">
                      {kids.map((child) => (
                        <li key={child.path}>
                          <Link
                            to={child.path}
                            onClick={onClose}
                            className={`flex items-center gap-3 pr-12 pl-6 py-2.5 text-sm transition-all duration-200 ${
                              location.pathname === child.path
                                ? "text-[#D4AF37] border-r-4 border-[#D4AF37] font-bold bg-[#D4AF37]/10"
                                : "hover:bg-white/5 text-gray-400 hover:text-white"
                            }`}
                          >
                            {child.icon}
                            <span className="font-medium">{child.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-6 border-t border-white/10 space-y-2">
          <Link 
            to="/app/settings"
            onClick={onClose}
            className="flex items-center gap-3 text-gray-300 hover:text-white transition-colors w-full px-2 py-2"
          >
            <Settings size={20} />
            <span className="font-medium">الإعدادات</span>
          </Link>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 text-red-400 hover:text-red-300 transition-colors w-full px-2 py-2"
          >
            <LogOut size={20} />
            <span className="font-medium">تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function Header({ onMenuOpen }: { onMenuOpen: () => void }) {
  const userName = localStorage.getItem("userName") || "مستخدم";
  const userRole = localStorage.getItem("userRole");
  const lawyerId = localStorage.getItem("lawyerId");
  const userId = localStorage.getItem("userId");
  // كان يعرض "متدرب" لأي دور غير الثلاثة المعروفة — وهو خطأ مع الأدوار الجديدة
  const roleName = roleLabel(userRole);

  interface NotificationAlert {
    id: string;
    type: "HEARING" | "TASK";
    title: string;
    description: string;
    date: string;
    badge: string;
    badgeColor: string;
    link: string;
  }

  const [notifications, setNotifications] = useState<NotificationAlert[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const prevIdsRef = useRef<string[]>([]);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const playNote = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        
        gainNode.gain.setValueAtTime(0.12, start);
        gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.02);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = audioCtx.currentTime;
      // High premium dual-tone bell chime
      playNote(1046.50, now, 0.4); // C6
      playNote(1318.51, now + 0.10, 0.5); // E6
    } catch (err) {
      console.error("Audio chime error:", err);
    }
  };

  const fetchNotifications = async () => {
    if (!lawyerId && userRole !== "SUPER_ADMIN") return;
    setLoadingNotifications(true);

    try {
      // 1. Fetch Tasks
      let tasksQ = collection(db, "tasks");
      if (userRole !== "SUPER_ADMIN") {
        tasksQ = query(collection(db, "tasks"), where("lawyerId", "==", lawyerId)) as any;
      }
      const tasksSnap = await getDocs(tasksQ);
      let tasksList = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      if (userRole === "TRAINEE" || userRole === "OFFICE_LAWYER") {
        tasksList = tasksList.filter(t => t.assignedTo === userId);
      }

      // 2. Fetch Hearings
      let hearingsList: any[] = [];
      if (userRole === "SUPER_ADMIN") {
        const snap = await getDocs(collectionGroup(db, "hearings"));
        hearingsList = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as any,
          caseId: doc.data().caseId || doc.ref.parent.parent?.id,
        }));
      } else {
        let casesQuery;
        if (userRole === "OFFICE_LAWYER") {
          casesQuery = query(collection(db, "cases"), where("lawyerId", "==", lawyerId), where("assignedLawyerId", "==", userId), limit(100));
        } else {
          casesQuery = query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(100));
        }
        const casesSnap = await getDocs(casesQuery);
        const arrays = await Promise.all(
          casesSnap.docs.map(cd =>
            getDocs(collection(db, "cases", cd.id, "hearings")).then(s =>
              s.docs.map(d => ({ id: d.id, ...d.data() as any, caseId: cd.id }))
            )
          )
        );
        hearingsList = arrays.flat();
      }

      // 3. Process alerts
      const alerts: NotificationAlert[] = [];
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);

      // Hearings
      hearingsList.forEach(h => {
        if (!h.hearingDate) return;
        const hearingDate = new Date(h.hearingDate);
        hearingDate.setHours(0, 0, 0, 0);

        const diffTime = hearingDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          alerts.push({
            id: `hearing-${h.id}`,
            type: "HEARING",
            title: `جلسة اليوم: ${h.caseTitle || "قضية"}`,
            description: `المحكمة: ${h.court || "غير محددة"} | طلبات: ${h.requiredActions || "لا يوجد"}`,
            date: h.hearingDate,
            badge: "اليوم",
            badgeColor: "bg-red-500 text-white",
            link: "/app/hearings"
          });
        } else if (diffDays === 1) {
          alerts.push({
            id: `hearing-${h.id}`,
            type: "HEARING",
            title: `جلسة غداً: ${h.caseTitle || "قضية"}`,
            description: `المحكمة: ${h.court || "غير محددة"}`,
            date: h.hearingDate,
            badge: "غداً",
            badgeColor: "bg-orange-500 text-white",
            link: "/app/hearings"
          });
        } else if (diffDays > 1 && diffDays <= 3) {
          alerts.push({
            id: `hearing-${h.id}`,
            type: "HEARING",
            title: `جلسة قريبة: ${h.caseTitle || "قضية"}`,
            description: `المحكمة: ${h.court || "غير محددة"} بعد ${diffDays} أيام`,
            date: h.hearingDate,
            badge: `خلال ${diffDays} أيام`,
            badgeColor: "bg-blue-500 text-white",
            link: "/app/hearings"
          });
        }
      });

      // Tasks
      tasksList.forEach(t => {
        if (t.status === "COMPLETED" || !t.dueDate) return;
        
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          alerts.push({
            id: `task-${t.id}`,
            type: "TASK",
            title: `مهمة متأخرة: ${t.title}`,
            description: t.description || "تجاوزت هذه المهمة موعد استحقاقها المخطط.",
            date: t.dueDate,
            badge: "متأخرة",
            badgeColor: "bg-rose-600 text-white animate-pulse",
            link: "/app/tasks"
          });
        } else if (diffDays === 0) {
          alerts.push({
            id: `task-${t.id}`,
            type: "TASK",
            title: `مهمة تستحق اليوم: ${t.title}`,
            description: t.description || "يجب تسليم وإكمال هذه المهمة اليوم.",
            date: t.dueDate,
            badge: "اليوم",
            badgeColor: "bg-amber-500 text-white",
            link: "/app/tasks"
          });
        } else if (diffDays <= 2) {
          alerts.push({
            id: `task-${t.id}`,
            type: "TASK",
            title: `مهمة تقترب: ${t.title}`,
            description: t.description || `باقي ${diffDays} أيام على التسليم.`,
            date: t.dueDate,
            badge: `خلال ${diffDays} يوم`,
            badgeColor: "bg-amber-400 text-[#133B2E]",
            link: "/app/tasks"
          });
        }
      });

      alerts.sort((a, b) => {
        const isAUrgent = a.badge === "متأخرة" || a.badge === "اليوم";
        const isBUrgent = b.badge === "متأخرة" || b.badge === "اليوم";
        if (isAUrgent && !isBUrgent) return -1;
        if (!isAUrgent && isBUrgent) return 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      const newIds = alerts.map(a => a.id);
      if (prevIdsRef.current.length > 0) {
        const hasNewAlert = newIds.some(id => !prevIdsRef.current.includes(id));
        if (hasNewAlert) {
          playNotificationSound();
        }
      }
      prevIdsRef.current = newIds;

      setNotifications(alerts);
    } catch (e) {
      console.error("Error setting notification alerts:", e);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [lawyerId, userRole]);

  // يملأ كولكشن notifications ليعمل مركز التنبيهات وتفضيلات القنوات.
  // منفصل عن حساب الجرس أعلاه فلا يغيّر سلوكه، ومنعُ التكرار يجعل
  // إعادة التشغيل آمنة مهما تكررت.
  //
  // مُقيَّد بحدّين: فحص واحد كل نصف ساعة، ومؤجَّل بعد تحميل الصفحة —
  // الفحص يقرأ خمس مجموعات وجلسات كل قضية، وتشغيله مع باقي استعلامات
  // اللوحة في اللحظة نفسها كان يُحمّل الاتصال بلا داعٍ.
  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (!lawyerId || !uid) return;
    if (!shouldAutoScan(uid)) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const prefs = await loadPreferences(uid);
          if (!cancelled) await generateNotifications(lawyerId, uid, prefs);
        } catch {
          // التنبيهات مساعدة — فشلها لا يُعطّل الواجهة
        }
      })();
    }, 6000);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [lawyerId]);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-4">
        <button onClick={onMenuOpen} className="md:hidden text-[#133B2E] hover:text-gray-700 p-1">
          <Menu size={24} />
        </button>
        <div className="relative hidden sm:block">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="بحث..."
            className="pl-4 pr-10 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:border-[#133B2E] focus:ring-1 focus:ring-[#133B2E] w-64 bg-gray-50"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative">
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className={`relative p-2 text-gray-500 hover:text-gray-700 transition-colors rounded-full ${showDropdown ? "bg-gray-100" : "hover:bg-gray-50"}`}
            title="التنبيهات"
          >
            <Bell size={20} />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {notifications.length}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowDropdown(false)} 
                />
                
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 mt-2 w-80 sm:w-96 bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden z-50 font-['Tajawal'] text-right"
                  dir="rtl"
                >
                  <div className="bg-[#133B2E] p-4 text-white flex items-center justify-between">
                    <span className="font-bold text-sm">التنبيهات والإشعارات ({notifications.length})</span>
                    <button 
                      onClick={fetchNotifications}
                      className="text-xs text-[#D4AF37] hover:underline flex items-center gap-1"
                      disabled={loadingNotifications}
                    >
                      {loadingNotifications ? "جاري التحديث..." : "تحديث"}
                    </button>
                  </div>
                  
                  <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-100">
                    {loadingNotifications && notifications.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin text-[#133B2E]" size={20} />
                        <span>جاري تحميل التنبيهات...</span>
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-8 text-center text-gray-400 text-sm flex flex-col items-center gap-3">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                          <Bell size={24} />
                        </div>
                        <p className="font-medium text-gray-500">لا توجد تنبيهات عاجلة حالياً</p>
                        <p className="text-xs text-gray-400">ستظهر هنا إشعارات الجلسات القريبة والمهام المتأخرة.</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <Link
                          key={n.id}
                          to={n.link}
                          onClick={() => setShowDropdown(false)}
                          className="p-4 flex gap-3 hover:bg-gray-50 transition-colors block text-right"
                        >
                          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${n.type === "HEARING" ? "bg-amber-50 text-[#D4AF37]" : "bg-blue-50 text-blue-600"}`}>
                            {n.type === "HEARING" ? <Calendar size={16} /> : <CheckSquare size={16} />}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-xs text-[#133B2E] truncate">{n.title}</p>
                              <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${n.badgeColor}`}>
                                {n.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{n.description}</p>
                            <p className="text-[9px] text-gray-400 font-mono" dir="ltr">{n.date}</p>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>

                  {/* رابط مركز التنبيهات الكامل */}
                  <Link
                    to="/app/notifications"
                    onClick={() => setShowDropdown(false)}
                    className="block border-t bg-gray-50/70 px-4 py-2.5 text-center text-xs font-bold text-[#133B2E] hover:bg-gray-100 transition"
                  >
                    عرض كل التنبيهات
                  </Link>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 md:gap-3 border-l pr-2 md:pl-4 border-gray-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-[#133B2E]">{userName}</p>
            <p className="text-xs text-gray-500">{roleName}</p>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 bg-[#D4AF37] rounded-full flex items-center justify-center font-bold text-lg overflow-hidden border-2 border-white/20 shadow-sm">
            <img src="/logo.png" alt="User" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </header>
  );
}

import { AiAssistant } from "./components/AiAssistant";

function SubscriptionBanner() {
  const role   = localStorage.getItem("userRole");
  const expiry = localStorage.getItem("subscriptionExpiry");
  if (role !== "LAWYER" || !expiry) return null;

  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days > 14) return null;

  const isExpired = days <= 0;
  const bg  = isExpired ? "bg-red-600" : days <= 7 ? "bg-orange-500" : "bg-yellow-500";
  const msg = isExpired
    ? "⚠️ انتهى اشتراكك — بعض المميزات معطلة. جدد الآن لاستعادة كل الخدمات."
    : `⏳ اشتراكك ينتهي خلال ${days} ${days === 1 ? "يوم" : "أيام"} — جدد الآن لتجنب انقطاع الخدمة.`;

  return (
    <div className={`${bg} text-white text-sm font-bold px-4 py-2.5 flex items-center justify-between gap-4`} dir="rtl">
      <span>{msg}</span>
      <a
        href={`https://wa.me/201094040671?text=${encodeURIComponent("أريد تجديد اشتراكي في LawyerOS")}`}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 bg-white/20 hover:bg-white/30 px-4 py-1 rounded-full text-xs transition"
      >
        تجديد الاشتراك
      </a>
    </div>
  );
}

/**
 * تُعرض حين ينتهي توكن Firebase بينما التخزين المحلي ما زال يدّعي الدخول.
 * كل قراءة من قاعدة البيانات في هذه الحالة تُرفض بـ permission-denied،
 * فالأصدق أن نقولها صراحةً بدل عرض أصفار وأخطاء غامضة.
 */
function SessionExpired({ email }: { email: string | null }) {
  const goLogin = () => {
    clearLocalSession();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] p-6 font-['Tajawal']" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center space-y-4 border border-gray-100">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
          <Shield size={30} />
        </div>
        <h1 className="text-2xl font-bold text-[#133B2E]">انتهت جلستك</h1>
        <p className="text-sm text-gray-600 leading-relaxed">
          انتهت صلاحية تسجيل دخولك، ولهذا ظهرت البيانات فارغة.
          سجّل الدخول مرة أخرى لمتابعة العمل — لم يُفقد أي شيء من بياناتك.
        </p>
        {email && (
          <p className="text-xs text-gray-400 font-mono" dir="ltr">{email}</p>
        )}
        <button
          onClick={goLogin}
          className="w-full py-3.5 rounded-2xl bg-[#133B2E] text-[#D4AF37] font-bold hover:bg-[#133B2E]/90 transition"
        >
          تسجيل الدخول من جديد
        </button>
      </div>
    </div>
  );
}

function Layout() {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const lawyerId = localStorage.getItem("lawyerId");
  // مصدر الحقيقة لحالة الدخول هو Firebase لا localStorage
  const session = useAuthSession();

  // تجاوزات الصلاحيات محفوظة في Firestore على مستوى المكتب — تُحمّل مرة واحدة
  useEffect(() => {
    void loadOfficeSettings(lawyerId);
    void loadOfficeLookups(lawyerId);
  }, [lawyerId]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // انتهت جلسة Firebase بينما التخزين المحلي يدّعي أننا داخل:
  // نُعلم المستخدم بدل تركه يرى أصفاراً وأخطاء صلاحيات لا يفهمها.
  if (session.state === "expired") {
    return <SessionExpired email={session.email} />;
  }

  return (
    <div className="flex min-h-screen bg-[#F3F4F6] text-[#133B2E] font-['Tajawal']" dir="rtl">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuOpen={() => setIsSidebarOpen(true)} />
        <SubscriptionBanner />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LoadingFallback() {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-[#133B2E] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[#133B2E] font-bold">جاري التحميل...</p>
            </div>
        </div>
    );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/create-admin"
            element={CREATE_ADMIN_ENABLED ? <CreateAdmin /> : <Navigate to="/login" replace />}
          />
          <Route path="/app" element={<Layout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="lawyers" element={<Lawyers />} />
            <Route path="clients" element={<Clients />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:id" element={<CaseDetails />} />
            <Route path="hearings" element={<Hearings />} />
            <Route path="hearings/:caseId/:hearingId" element={<HearingDetails />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="documents" element={<Documents />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="trainees" element={<Trainees />} />
            <Route path="office-lawyers" element={<OfficeLawyers />} />
            <Route path="consultants" element={<Consultants />} />
            <Route path="team" element={<Team />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="recycle-bin" element={<RecycleBin />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="client-portal" element={<ClientPortalAdmin />} />
            <Route path="fee-agreements" element={<FeeAgreements />} />
            <Route path="time-entries" element={<TimeEntries />} />
            <Route path="ai-chat" element={<AiChat />} />
            <Route path="reports" element={<Reports />} />
            <Route path="library" element={<LegalLibrary />} />
            <Route path="subscriptions" element={<SubscriptionRequests />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
