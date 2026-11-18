/**
 * تنبيه لمدير المنصة حين يتوقف مفتاح الذكاء الاصطناعي عند كل المكاتب
 * (نفاد الرصيد/الحد، أو مشكلة في المفتاح أو الحساب). يكتبه وسيط الذكاء
 * الاصطناعي في platform_status/ai، ويختفي تلقائياً عند أول رد ناجح.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

interface PlatformAiStatus {
  state: "DOWN" | "OK";
  reason: "" | "QUOTA" | "ACCOUNT" | "MANUAL";
  httpStatus: number;
  at?: Timestamp;
}

const REASON_TEXT: Record<string, string> = {
  QUOTA: "رفض Google الطلبات لنفاد رصيد مفتاح المنصة أو تجاوز حده (أو ضغط مؤقت لديه). راجع الرصيد والفوترة في Google AI Studio.",
  ACCOUNT: "رفض Google مفتاح المنصة (مفتاح غير صالح أو الفوترة متوقفة). راجع المفتاح في أسرار GitHub والحساب في Google AI Studio.",
};

export default function PlatformAiStatusBanner() {
  const [status, setStatus] = useState<PlatformAiStatus | null>(null);

  useEffect(() => onSnapshot(
    doc(db, "platform_status", "ai"),
    (snap) => setStatus(snap.exists() ? (snap.data() as PlatformAiStatus) : null),
    () => setStatus(null),
  ), []);

  if (status?.state !== "DOWN") return null;

  const dismiss = () => setDoc(doc(db, "platform_status", "ai"), {
    state: "OK", reason: "MANUAL", httpStatus: 0, at: serverTimestamp(),
  }).catch((err) => alert("تعذّر إخفاء التنبيه: " + (err?.message || err)));

  const since = status.at?.toDate().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" dir="rtl" role="alert">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
      <div className="flex-1 space-y-1">
        <p className="font-bold">المساعد الذكي متوقف عند كل المكاتب{since ? ` منذ ${since}` : ""}</p>
        <p className="leading-6">{REASON_TEXT[status.reason] || "رفض مزوّد الذكاء الاصطناعي طلبات المنصة."} (الرمز {status.httpStatus})</p>
        <p className="text-xs text-red-600">يختفي التنبيه تلقائياً عند أول رد ناجح. المستخدمون يرون رسالة أن الخدمة متوقفة مؤقتاً وأن الإدارة عرفت.</p>
      </div>
      <button type="button" onClick={dismiss} className="rounded-lg p-1.5 text-red-600 hover:bg-red-100" title="تم الحل — إخفاء التنبيه">
        <X size={16} />
      </button>
    </div>
  );
}
