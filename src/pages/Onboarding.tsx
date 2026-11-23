/**
 * إعداد المكتب بعد التسجيل الذاتي — خطوتان:
 *   1. هوية المكتب: الشعار والختم الإلكتروني (يمكن تخطيها، وتُعدَّل لاحقاً من الإعدادات)
 *   2. الباقات: طلب باقة الآن أو المتابعة على الفترة التجريبية
 *
 * ?step=plans يفتح خطوة الباقات مباشرة (من شريط «الفترة التجريبية» داخل التطبيق).
 */

import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { doc, getDoc, updateDoc } from "@/lib/store";
import { ImagePlus, Stamp, Loader2, CheckCircle2, ArrowLeft, LogOut, Sparkles } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuthSession } from "../lib/useAuthSession";
import { loadOfficeSettings, saveOfficeProfile, saveOfficialStamp, useOfficeSettings } from "../lib/officeSettings";
import { logout, trialDaysLeft } from "../lib/session";
import PlanPicker, { currencyForCountry, type PendingPlanRequest, type PlanRequester } from "../components/PlanPicker";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة (PNG أو JPG).");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("حجم الصورة أكبر من 5 ميجابايت.");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/upload.php", { headers: { "X-Mz-Upload": "1" }, method: "POST", body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.fileUrl) throw new Error(data?.error || "تعذّر رفع الصورة. أعد المحاولة.");
  return data.fileUrl as string;
}

interface OwnerDoc {
  name?: string;
  email?: string;
  phone?: string;
  officeName?: string;
  country?: string;
  pendingPlanRequest?: PendingPlanRequest;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = useAuthSession();
  const office = useOfficeSettings();
  const lawyerId = localStorage.getItem("lawyerId");
  const userId = localStorage.getItem("userId");
  const role = localStorage.getItem("userRole");

  const [step, setStep] = useState<"branding" | "plans">(searchParams.get("step") === "plans" ? "plans" : "branding");
  const [owner, setOwner] = useState<OwnerDoc | null>(null);
  const [uploading, setUploading] = useState<"logo" | "stamp" | null>(null);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  /** الرفع ينتظر تحميل ترويسة المكتب — وإلا كُتب الشعار فوق ملف فارغ يمحو بيانات التسجيل */
  const [settingsReady, setSettingsReady] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.state !== "authenticated" || !lawyerId || !userId) return;
    void loadOfficeSettings(lawyerId).then(() => setSettingsReady(true));
    getDoc(doc(db, "users", userId))
      .then((snap) => setOwner((snap.data() as OwnerDoc) || {}))
      .catch(() => setOwner({}));
  }, [session.state, lawyerId, userId]);

  if (localStorage.getItem("isAuthenticated") !== "true" || session.state === "signed-out" || session.state === "expired") {
    return <Navigate to="/login" replace />;
  }
  if (role !== "LAWYER") return <Navigate to="/app" replace />;

  const handleUpload = async (kind: "logo" | "stamp", file: File | undefined) => {
    if (!file || !lawyerId) return;
    setUploading(kind);
    setError("");
    try {
      const url = await uploadImage(file);
      if (kind === "logo") await saveOfficeProfile(lawyerId, { ...office.officeProfile, logoUrl: url }, userId);
      else await saveOfficialStamp(lawyerId, url, userId);
    } catch (err: any) {
      setError(err?.message || "تعذّر حفظ الصورة.");
    } finally {
      setUploading(null);
      if (logoRef.current) logoRef.current.value = "";
      if (stampRef.current) stampRef.current.value = "";
    }
  };

  const finish = async () => {
    setFinishing(true);
    if (userId) await updateDoc(doc(db, "users", userId), { onboardingCompleted: true }).catch(() => {});
    navigate("/app", { replace: true });
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const daysLeft = trialDaysLeft();
  const requester: PlanRequester = {
    uid: userId || "",
    name: owner?.name || localStorage.getItem("userName") || "",
    email: owner?.email || localStorage.getItem("userEmail") || "",
    phone: owner?.phone || "",
  };
  const logoUrl = office.officeProfile.logoUrl;
  const stampUrl = office.officialStampUrl;

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

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <ol className="mb-8 flex items-center justify-center gap-3 text-sm" aria-label="خطوات الإعداد">
          {[
            { id: "branding", label: "هوية المكتب" },
            { id: "plans", label: "اختيار الباقة" },
          ].map((s, i) => {
            const active = step === s.id;
            const done = step === "plans" && s.id === "branding";
            return (
              <li key={s.id} className="flex items-center gap-3">
                {i > 0 && <span className="h-px w-8 bg-gray-300 sm:w-16" />}
                <span className={`flex items-center gap-2 font-semibold ${active ? "text-ink" : "text-gray-400"}`}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${active ? "bg-navy text-white" : done ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                    {done ? <CheckCircle2 size={15} /> : i + 1}
                  </span>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {step === "branding" && (
          <section className="mx-auto max-w-3xl">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold sm:text-3xl">أهلاً بك في موازين{owner?.officeName ? ` — ${owner.officeName}` : ""}</h1>
              <p className="mt-2 text-gray-500">أضف شعار مكتبك وختمه الإلكتروني ليظهرا على المذكرات والتقارير المطبوعة.</p>
            </div>

            {error && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UploadCard
                title="شعار المكتب"
                hint="يظهر في ترويسة المستندات. يُفضَّل PNG بخلفية شفافة."
                icon={<ImagePlus size={28} />}
                imageUrl={logoUrl}
                busy={uploading === "logo"}
                disabled={uploading !== null || !settingsReady}
                onPick={() => logoRef.current?.click()}
              />
              <UploadCard
                title="الختم الإلكتروني"
                hint="يُطبع على المذكرات بعد اعتمادها نهائياً."
                icon={<Stamp size={28} />}
                imageUrl={stampUrl}
                busy={uploading === "stamp"}
                disabled={uploading !== null || !settingsReady}
                onPick={() => stampRef.current?.click()}
              />
            </div>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload("logo", e.target.files?.[0])} />
            <input ref={stampRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload("stamp", e.target.files?.[0])} />

            <div className="mt-8 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
              <button type="button" onClick={() => setStep("plans")} className="text-sm font-semibold text-gray-500 hover:text-ink hover:underline">
                تخطي هذه الخطوة الآن
              </button>
              <button
                type="button"
                onClick={() => setStep("plans")}
                disabled={uploading !== null}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy px-8 py-3.5 font-bold text-white transition hover:bg-navy/90 disabled:opacity-60 sm:w-auto"
              >
                التالي <ArrowLeft size={18} />
              </button>
            </div>
            <p className="mt-4 text-center text-xs text-gray-400">يمكنك تغيير الشعار والختم في أي وقت من الإعدادات.</p>
          </section>
        )}

        {step === "plans" && (
          <section>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold sm:text-3xl">اختر الباقة المناسبة لمكتبك</h1>
              <p className="mt-2 text-gray-500">
                {daysLeft !== null
                  ? <>أنت الآن في الفترة التجريبية المجانية — متبقٍ <b className="text-ink">{daysLeft}</b> {daysLeft === 1 ? "يوم" : "يوماً"}. يمكنك الاشتراك الآن أو لاحقاً.</>
                  : "اطلب الباقة المناسبة وسيفعّلها فريقنا بعد إتمام الدفع."}
              </p>
            </div>

            {owner === null ? (
              <div className="flex justify-center py-16 text-gray-500"><Loader2 className="animate-spin" /></div>
            ) : (
              <PlanPicker
                requester={requester}
                currency={currencyForCountry(owner.country)}
                pending={owner.pendingPlanRequest ?? null}
                showPrices={daysLeft === null}
              />
            )}

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={finish}
                disabled={finishing}
                className="flex items-center gap-2 rounded-2xl border-2 border-navy px-8 py-3.5 font-bold text-ink transition hover:bg-navy hover:text-white disabled:opacity-60"
              >
                {finishing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {daysLeft !== null ? "متابعة الفترة التجريبية والدخول للبرنامج" : "الدخول للبرنامج"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function UploadCard({
  title, hint, icon, imageUrl, busy, disabled, onPick,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  imageUrl: string | null;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="group flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-gray-300 bg-surface p-6 text-center transition hover:border-navy-2 disabled:opacity-70 dark:border-white/15"
    >
      <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-gray-50 text-gray-400 group-hover:text-ink dark:bg-white/5">
        {busy ? <Loader2 size={28} className="animate-spin" /> : imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-contain p-2" /> : icon}
      </div>
      <div>
        <p className="flex items-center justify-center gap-1.5 font-bold text-ink">
          {imageUrl && <CheckCircle2 size={16} className="text-emerald-600" />}
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{hint}</p>
      </div>
      <span className="text-sm font-semibold text-ink-2 group-hover:underline">{imageUrl ? "استبدال الصورة" : "رفع صورة"}</span>
    </button>
  );
}
