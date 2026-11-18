/**
 * انتهت الفترة التجريبية دون اشتراك — الدخول للبرنامج مقفل حتى يُفعَّل اشتراك مدفوع.
 * البيانات محفوظة كما هي. مالك المكتب يطلب باقة من هنا، وفريقه يرى رسالة بمراجعة المالك.
 */

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import { Hourglass, LogOut, RefreshCw, Loader2, Database } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuthSession } from "../lib/useAuthSession";
import { isTrialLocked, logout, refreshOfficeSubscription, trialDeletionDate } from "../lib/session";
import PlanPicker, { currencyForCountry, type PendingPlanRequest } from "../components/PlanPicker";

interface OwnerDoc {
  name?: string;
  email?: string;
  phone?: string;
  officeName?: string;
  country?: string;
  pendingPlanRequest?: PendingPlanRequest;
}

export default function TrialExpired() {
  const navigate = useNavigate();
  const session = useAuthSession();
  const role = localStorage.getItem("userRole");
  const userId = localStorage.getItem("userId") || "";
  const isOwner = role === "LAWYER";

  const [owner, setOwner] = useState<OwnerDoc | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (session.state !== "authenticated" || !isOwner || !userId) return;
    getDoc(doc(db, "users", userId))
      .then((snap) => setOwner((snap.data() as OwnerDoc) || {}))
      .catch(() => setOwner({}));
  }, [session.state, isOwner, userId]);

  if (localStorage.getItem("isAuthenticated") !== "true" || session.state === "signed-out" || session.state === "expired") {
    return <Navigate to="/login" replace />;
  }
  if (!isTrialLocked()) return <Navigate to="/app" replace />;

  const checkActivation = async () => {
    setChecking(true);
    setMessage("");
    try {
      if (await refreshOfficeSubscription()) {
        navigate("/app", { replace: true });
        return;
      }
      setMessage("لم يُفعَّل الاشتراك بعد. إن أتممت الدفع فسيُفعَّل خلال 24 ساعة.");
    } catch {
      setMessage("تعذّر التحقق الآن. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setChecking(false);
    }
  };

  // الحذف التلقائي بعد مهلة الاحتفاظ (trial-cleanup.php) — طلب باقة معلّق يؤجله حتى مراجعته
  const deleteAt = trialDeletionDate();
  const daysToDelete = deleteAt ? Math.max(1, Math.ceil((deleteAt.getTime() - Date.now()) / 86400000)) : 0;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-page font-['Tajawal'] text-ink" dir="rtl">
      <header className="bg-navy">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <img src="/logo-light.png" alt="موازين" className="h-9 w-auto sm:h-10" />
          <button type="button" onClick={handleLogout} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
            <LogOut size={16} /> خروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Hourglass size={30} />
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">انتهت الفترة التجريبية{owner?.officeName ? ` لمكتب ${owner.officeName}` : ""}</h1>
          <p className="mt-3 leading-relaxed text-gray-600 dark:text-gray-300">
            {isOwner
              ? "اختر باقة لمتابعة استخدام موازين. يُفعَّل اشتراكك بعد إتمام الدفع، وتعود لعملك من حيث توقفت."
              : "انتهت الفترة التجريبية لمكتبك. تواصل مع مدير المكتب لتفعيل الاشتراك ثم سجّل الدخول من جديد."}
          </p>
          {deleteAt && deleteAt.getTime() > Date.now() ? (
            <p className="mt-3 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              <Database size={15} /> بياناتك محفوظة حتى {deleteAt.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}
              ({daysToDelete} {daysToDelete === 1 ? "يوم" : "أيام"})، وبعدها تُحذف نهائياً إن لم يُفعَّل اشتراك
            </p>
          ) : deleteAt ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm text-amber-700 dark:bg-amber-500/10">
              <Database size={15} /> بياناتك مجدولة للحذف — اطلب باقة الآن لإيقافه
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm text-emerald-700 dark:bg-emerald-500/10">
              <Database size={15} /> كل بياناتك محفوظة
            </p>
          )}
        </div>

        {isOwner && (
          owner === null ? (
            <div className="flex justify-center py-16 text-gray-500"><Loader2 className="animate-spin" /></div>
          ) : (
            <PlanPicker
              requester={{
                uid: userId,
                name: owner.name || localStorage.getItem("userName") || "",
                email: owner.email || localStorage.getItem("userEmail") || "",
                phone: owner.phone || "",
              }}
              currency={currencyForCountry(owner.country)}
              pending={owner.pendingPlanRequest ?? null}
            />
          )
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={checkActivation}
            disabled={checking}
            className="flex items-center gap-2 rounded-2xl border-2 border-navy px-6 py-3 font-bold text-ink transition hover:bg-navy hover:text-white disabled:opacity-60"
          >
            {checking ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            تحقق من تفعيل الاشتراك
          </button>
          {message && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
        </div>
      </main>
    </div>
  );
}
