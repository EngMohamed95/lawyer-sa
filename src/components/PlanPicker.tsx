/**
 * اختيار باقة الاشتراك من داخل التطبيق — في خطوة الإعداد بعد التسجيل وفي صفحة انتهاء التجربة.
 *
 * الباقات من «باقات الاشتراك» التي يديرها مدير المنصة (subscriptionPlans)، وإن لم تُضبط
 * بعد نعرض الباقات الافتراضية. الطلب يُحفظ في subscriptionRequests ليفعّله مدير المنصة
 * من «طلبات الاشتراك» بعد الدفع — نفس مسار الطلبات القائم.
 */

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, updateDoc } from "@/lib/store";
import { CheckCircle2, Loader2, Clock, CreditCard } from "lucide-react";
import { db } from "../lib/firebase";
import {
  DEFAULT_PLANS, QUOTA_LABELS, TIER_LABELS, loadPlans,
  type Currency, type SubscriptionPlan,
} from "../lib/subscriptionPlans";

const CURRENCY_SYMBOL: Record<Currency, string> = { SAR: "ر.س", EGP: "ج.م", USD: "$" };
const PAYMENT_PHONE = "01094040671";
const WHATSAPP_NUMBER = "201094040671";

export interface PlanRequester {
  uid: string;
  name: string;
  email: string;
  phone: string;
}

export interface PendingPlanRequest {
  planId: string;
  planName: string;
  at: string;
}

/** السعر بعملة المكتب، وإن لم يُسعَّر بها نعرض أول عملة مسعَّرة */
function priceFor(plan: SubscriptionPlan, preferred: Currency): { amount: number; currency: Currency } | null {
  const order: Currency[] = [preferred, ...(["SAR", "EGP", "USD"] as Currency[]).filter((c) => c !== preferred)];
  for (const c of order) {
    if (plan.prices[c] > 0) return { amount: plan.prices[c], currency: c };
  }
  return null;
}

export function currencyForCountry(country?: string | null): Currency {
  return country === "EG" ? "EGP" : country === "SA" ? "SAR" : "USD";
}

export default function PlanPicker({
  requester, currency, pending, onRequested, showPrices = true,
}: {
  requester: PlanRequester;
  currency: Currency;
  pending?: PendingPlanRequest | null;
  onRequested?: (req: PendingPlanRequest) => void;
  showPrices?: boolean;
}) {
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState<PendingPlanRequest | null>(pending ?? null);

  useEffect(() => setRequested(pending ?? null), [pending]);

  useEffect(() => {
    let cancelled = false;
    loadPlans()
      .catch(() => [] as SubscriptionPlan[])
      .then((list) => {
        if (cancelled) return;
        const paid = list.filter((p) => p.active && p.billing !== "trial");
        setPlans(paid.length ? paid : DEFAULT_PLANS.filter((p) => p.billing !== "trial"));
      });
    return () => { cancelled = true; };
  }, []);

  const chosen = useMemo(() => plans?.find((p) => p.id === requested?.planId) ?? null, [plans, requested]);

  const requestPlan = async (plan: SubscriptionPlan) => {
    setBusyId(plan.id);
    setError("");
    const price = priceFor(plan, currency);
    const at = new Date().toISOString();
    try {
      await addDoc(collection(db, "subscriptionRequests"), {
        name: requester.name,
        phone: requester.phone,
        email: requester.email,
        plan: plan.tier,
        planId: plan.id,
        planName: plan.name,
        billing: plan.billing,
        amount: price?.amount ?? 0,
        currency: price?.currency ?? currency,
        userId: requester.uid,
        source: "in-app",
        status: "pending",
        createdAt: at,
      });
      const req = { planId: plan.id, planName: plan.name, at };
      // يظهر «طلبك قيد المراجعة» في الزيارات القادمة — فشله لا يُلغي الطلب
      await updateDoc(doc(db, "users", requester.uid), { pendingPlanRequest: req }).catch(() => {});
      setRequested(req);
      onRequested?.(req);
    } catch (err) {
      console.error(err);
      setError("تعذّر إرسال الطلب. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setBusyId(null);
    }
  };

  if (!plans) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 size={20} className="animate-spin" /> جاري تحميل الباقات...
      </div>
    );
  }

  if (requested) {
    const price = chosen ? priceFor(chosen, currency) : null;
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <Clock size={26} className="text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-ink">طلب «{requested.planName}» قيد المراجعة</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          بعد إتمام الدفع يفعّل فريقنا اشتراكك خلال 24 ساعة.
          {showPrices && price && <> قيمة الباقة: <b className="text-ink">{price.amount.toLocaleString("en")} {CURRENCY_SYMBOL[price.currency]}</b>.</>}
        </p>
        <div className="mt-4 rounded-2xl bg-surface p-4 text-right text-sm text-gray-600 dark:text-gray-300">
          <p className="mb-1 flex items-center gap-2 font-bold text-ink"><CreditCard size={15} /> طريقة الدفع</p>
          <p>فودافون كاش / إنستاباي: <b className="text-ink" dir="ltr">{PAYMENT_PHONE}</b></p>
        </div>
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`مرحباً، طلبت باقة ${requested.planName} في موازين وأريد إتمام الاشتراك. البريد: ${requester.email}`)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-block rounded-2xl bg-green-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-green-700"
        >
          تواصل معنا على واتساب لإتمام الدفع
        </a>
        <button type="button" onClick={() => setRequested(null)} className="mt-4 block w-full text-xs text-gray-500 hover:text-ink hover:underline">
          اختيار باقة أخرى
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan, i) => {
          const price = priceFor(plan, currency);
          const featured = plans.length >= 3 && i === 1;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border-2 bg-surface p-6 ${featured ? "border-navy-2 shadow-xl shadow-navy-2/10" : "border-gray-200 dark:border-white/10"}`}
            >
              {featured && (
                <span className="absolute -top-3 right-1/2 translate-x-1/2 whitespace-nowrap rounded-full bg-navy-2 px-3 py-1 text-xs font-bold text-white">
                  الأكثر طلباً
                </span>
              )}
              <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{TIER_LABELS[plan.tier]}</p>
              {showPrices && (
                <div className="my-4">
                  {price ? (
                  <>
                    <span className="text-3xl font-black text-ink">{price.amount.toLocaleString("en")}</span>
                    <span className="mr-1 text-sm text-gray-500">
                      {CURRENCY_SYMBOL[price.currency]} / {plan.billing === "annual" ? "سنة" : "شهر"}
                    </span>
                  </>
                  ) : (
                    <span className="text-sm font-bold text-gray-500">السعر عند التواصل</span>
                  )}
                </div>
              )}
              <ul className="mb-6 flex-1 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                {(["cases", "clients", "team"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                    {QUOTA_LABELS[k]}: {plan.quotas[k] === 0 ? "غير محدود" : plan.quotas[k].toLocaleString("en")}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => requestPlan(plan)}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition disabled:opacity-60 ${featured ? "bg-navy text-white hover:bg-navy/90" : "bg-gray-100 text-ink hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20"}`}
              >
                {busyId === plan.id ? <Loader2 size={16} className="animate-spin" /> : "اطلب هذه الباقة"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
