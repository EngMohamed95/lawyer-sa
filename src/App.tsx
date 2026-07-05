import { BrowserRouter as Router, Routes, Route, Outlet, Link, useLocation, Navigate, useNavigate } from "react-router";
import { LayoutDashboard, Users, Briefcase, Calendar, CheckSquare, FileText, Settings, Bell, Search, Menu, Calculator, GraduationCap, BarChart, LogOut, Shield, CreditCard, Loader2 } from "lucide-react";
import { useState, lazy, Suspense, useEffect, useRef } from "react";
import { collection, getDocs, query, where, collectionGroup, limit } from "firebase/firestore";
import { db } from "./lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

// Standard Import for Critical Pages (Faster initial load)
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";

// Lazy Loading for Dashboard & App Pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Cases = lazy(() => import("./pages/Cases"));
const CaseDetails = lazy(() => import("./pages/CaseDetails"));
const Hearings = lazy(() => import("./pages/Hearings"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Documents = lazy(() => import("./pages/Documents"));
const Accounting = lazy(() => import("./pages/Accounting"));
const Trainees = lazy(() => import("./pages/Trainees"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Lawyers = lazy(() => import("./pages/Lawyers"));
const SubscriptionRequests = lazy(() => import("./pages/SubscriptionRequests"));
const SubscribePage = lazy(() => import("./pages/SubscribePage"));

function Sidebar({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = localStorage.getItem("userRole");

  const navItems = [
    { name: "لوحة التحكم", path: "/app/dashboard", icon: <LayoutDashboard size={20} /> },
    { name: "المحامين", path: "/app/lawyers", icon: <Shield size={20} />, hidden: userRole !== "SUPER_ADMIN" },
    { name: "الاشتراكات", path: "/app/subscriptions", icon: <CreditCard size={20} />, hidden: userRole !== "SUPER_ADMIN" },
    
    // Baka 1: Basic (Clients, Cases, Hearings)
    { name: "الموكلين", path: "/app/clients", icon: <Users size={20} />, hidden: userRole === "SUPER_ADMIN" },
    { name: "القضايا", path: "/app/cases", icon: <Briefcase size={20} />, hidden: userRole === "SUPER_ADMIN" },
    { name: "الجلسات", path: "/app/hearings", icon: <Calendar size={20} />, hidden: userRole === "SUPER_ADMIN" },
    
    // Baka 2: Pro (Tasks, Documents, Accounting, Trainees)
    { name: "المهام", path: "/app/tasks", icon: <CheckSquare size={20} />, hidden: userRole === "SUPER_ADMIN" || (userRole === "LAWYER" && localStorage.getItem("userPlan") === "BASIC") },
    { name: "المستندات", path: "/app/documents", icon: <FileText size={20} />, hidden: userRole === "SUPER_ADMIN" || (userRole === "LAWYER" && localStorage.getItem("userPlan") === "BASIC") },
    { name: "الحسابات", path: "/app/accounting", icon: <Calculator size={20} />, hidden: userRole === "TRAINEE" || userRole === "SUPER_ADMIN" || (userRole === "LAWYER" && localStorage.getItem("userPlan") === "BASIC") },
    { name: "المتدربين", path: "/app/trainees", icon: <GraduationCap size={20} />, hidden: userRole !== "LAWYER" || localStorage.getItem("userPlan") === "BASIC" },
    
    // Baka 3: Premium (Reports + AI services)
    { name: "التقارير", path: "/app/reports", icon: <BarChart size={20} />, hidden: userRole === "TRAINEE" || userRole === "SUPER_ADMIN" || (userRole === "LAWYER" && localStorage.getItem("userPlan") !== "PREMIUM") },
  ];

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
      
      <aside className={`fixed md:sticky top-0 right-0 h-screen w-64 bg-[#0A192F] text-white flex flex-col shadow-2xl transition-transform duration-300 z-50 md:translate-x-0 ${isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
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
            {navItems.filter(item => !item.hidden).map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-6 py-3 transition-all duration-200 ${
                    location.pathname === item.path
                      ? "bg-[#D4AF37]/20 text-[#D4AF37] border-r-4 border-[#D4AF37] font-bold"
                      : "hover:bg-white/5 text-gray-300 hover:text-white"
                  }`}
                >
                  {item.icon}
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            ))}
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
  const roleName = userRole === "SUPER_ADMIN" ? "المدير العام" : userRole === "LAWYER" ? "محامي" : "متدرب";

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

      if (userRole === "TRAINEE") {
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
        const casesSnap = await getDocs(
          query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(100))
        );
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
            badgeColor: "bg-amber-400 text-[#0A192F]",
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

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-4">
        <button onClick={onMenuOpen} className="md:hidden text-[#0A192F] hover:text-gray-700 p-1">
          <Menu size={24} />
        </button>
        <div className="relative hidden sm:block">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="بحث..."
            className="pl-4 pr-10 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:border-[#0A192F] focus:ring-1 focus:ring-[#0A192F] w-64 bg-gray-50"
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
                  <div className="bg-[#0A192F] p-4 text-white flex items-center justify-between">
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
                        <Loader2 className="animate-spin text-[#0A192F]" size={20} />
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
                              <p className="font-bold text-xs text-[#0A192F] truncate">{n.title}</p>
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
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 md:gap-3 border-l pr-2 md:pl-4 border-gray-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-[#0A192F]">{userName}</p>
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

function Layout() {
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#F3F4F6] text-[#0A192F] font-['Tajawal']" dir="rtl">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuOpen={() => setIsSidebarOpen(true)} />
        <SubscriptionBanner />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
        <AiAssistant />
      </div>
    </div>
  );
}

function LoadingFallback() {
    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-[#0A192F] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[#0A192F] font-bold">جاري التحميل...</p>
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
          <Route path="/app" element={<Layout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="lawyers" element={<Lawyers />} />
            <Route path="clients" element={<Clients />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:id" element={<CaseDetails />} />
            <Route path="hearings" element={<Hearings />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="documents" element={<Documents />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="trainees" element={<Trainees />} />
            <Route path="reports" element={<Reports />} />
            <Route path="subscriptions" element={<SubscriptionRequests />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}
