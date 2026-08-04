/**
 * تبويب التنبيهات في الإعدادات — الوثيقة §1.1.
 * مصفوفة قناة × حدث · ساعات الهدوء · وضع الملخّص.
 */

import { useEffect, useState } from "react";
import { Bell, Save, AlertTriangle, CheckCircle2, Moon, Send } from "lucide-react";
import { Button } from "../ui/button";
import { usePermissions } from "../../lib/usePermissions";
import {
  CHANNEL_LABELS_AR, CHANNEL_READY, DEFAULT_PREFERENCES, EVENT_LABELS_AR,
  generateNotifications, loadPreferences, savePreferences,
  type Channel, type NotificationEvent, type NotificationPreferences,
} from "../../lib/notifications";

const EVENTS: NotificationEvent[] = [
  "HEARING_REMINDER", "HEARING_RESULT_MISSING",
  "TASK_DUE", "TASK_OVERDUE", "TASK_ASSIGNED",
  "CONTRACT_EXPIRING", "CONTRACT_PENDING_APPROVAL",
  "INVOICE_DUE", "INVOICE_OVERDUE",
  "APPOINTMENT_REMINDER", "CASE_STATUS_CHANGED", "DOCUMENT_SHARED",
];

const CHANNELS: Channel[] = ["IN_APP", "EMAIL", "WHATSAPP", "PUSH"];

export default function NotificationsTab() {
  const perms = usePermissions();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!perms.userId) { setLoading(false); return; }
    void loadPreferences(perms.userId).then((p) => { setPrefs(p); setLoading(false); });
  }, [perms.userId]);

  const isOn = (e: NotificationEvent, c: Channel) =>
    (prefs.channels[e] ?? (c === "IN_APP" ? ["IN_APP"] : [])).includes(c);

  const toggle = (e: NotificationEvent, c: Channel) => {
    setPrefs((p) => {
      const current = p.channels[e] ?? ["IN_APP"];
      const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
      return { ...p, channels: { ...p.channels, [e]: next } };
    });
  };

  const save = async () => {
    if (!perms.lawyerId || !perms.userId) { setErr("تعذّر تحديد الحساب."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      await savePreferences(perms.lawyerId, perms.userId, prefs);
      setMsg("حُفظت التفضيلات.");
    } catch (e) {
      console.error(e);
      setErr("تعذّر الحفظ. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const testRun = async () => {
    if (!perms.lawyerId || !perms.userId) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const n = await generateNotifications(perms.lawyerId, perms.userId, prefs);
      setMsg(n > 0
        ? `أُنشئ ${n} تنبيه جديد — راجعها من جرس التنبيهات أو صفحة التنبيهات.`
        : "لا أحداث تستدعي تنبيهاً الآن (أو أنها وُلّدت مسبقاً ولم تتكرر).");
    } catch {
      setErr("تعذّر تشغيل الفحص.");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">جاري التحميل...</div>;

  const field = "px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-[#D4AF37]" />
        <h3 className="font-bold text-lg text-[#133B2E]">تفضيلات التنبيهات</h3>
      </div>

      {err && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{err}</span>
        </div>
      )}
      {msg && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-100 text-green-800 text-sm">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> <span>{msg}</span>
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-right font-bold text-[#133B2E] px-4 py-3">الحدث</th>
              {CHANNELS.map((c) => (
                <th key={c} className="font-bold text-[#133B2E] px-3 py-3 text-center whitespace-nowrap">
                  {CHANNEL_LABELS_AR[c]}
                  {!CHANNEL_READY[c] && (
                    <span className="block text-[10px] font-normal text-amber-600">قريباً</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e) => (
              <tr key={e} className="border-t border-gray-100 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{EVENT_LABELS_AR[e]}</td>
                {CHANNELS.map((c) => (
                  <td key={c} className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={isOn(e, c)} onChange={() => toggle(e, c)}
                      disabled={!CHANNEL_READY[c]}
                      className="w-4 h-4 accent-[#133B2E] disabled:opacity-30"
                      title={CHANNEL_READY[c] ? "" : "هذه القناة تحتاج تفعيل المزوّد"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        القنوات المعلَّمة «قريباً» تُحفظ تفضيلاتها من الآن، وتعمل فور تفعيل المزوّد
        (بريد · واتساب · إشعار فوري).
      </p>

      <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={prefs.quietHours.enabled} className="w-5 h-5 accent-[#133B2E]"
            onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, enabled: e.target.checked } })} />
          <span className="text-sm font-bold text-gray-700 flex items-center gap-1">
            <Moon size={15} /> ساعات الهدوء
          </span>
        </label>
        {prefs.quietHours.enabled && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-gray-600">من</label>
            <input type="time" value={prefs.quietHours.from} className={field}
              onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, from: e.target.value } })} />
            <label className="text-sm text-gray-600">إلى</label>
            <input type="time" value={prefs.quietHours.to} className={field}
              onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours, to: e.target.value } })} />
          </div>
        )}
        <p className="text-xs text-gray-500">
          خلال ساعات الهدوء تُؤجَّل التنبيهات العادية — أما <strong>العاجلة</strong> (جلسة اليوم ·
          مهمة متأخرة · فاتورة متأخرة) فتصل دائماً.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
        <p className="text-sm font-bold text-gray-700">الملخّص الدوري</p>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={prefs.digestMode} className={field}
            onChange={(e) => setPrefs({ ...prefs, digestMode: e.target.value as NotificationPreferences["digestMode"] })}>
            <option value="OFF">بلا ملخّص</option>
            <option value="DAILY">ملخّص يومي</option>
            <option value="WEEKLY">ملخّص أسبوعي</option>
          </select>
          {prefs.digestMode !== "OFF" && (
            <>
              <label className="text-sm text-gray-600">وقت الإرسال</label>
              <input type="time" value={prefs.digestTime} className={field}
                onChange={(e) => setPrefs({ ...prefs, digestTime: e.target.value })} />
            </>
          )}
        </div>
        {prefs.digestMode !== "OFF" && (
          <p className="text-xs text-amber-700">
            الملخّص يحتاج مهمة مجدولة على الخادم — يُحفظ الإعداد ويعمل فور تفعيلها.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}
          className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-[#D4AF37] font-bold rounded-xl px-6">
          <Save size={16} className="ml-2" /> {busy ? "جاري الحفظ..." : "حفظ التفضيلات"}
        </Button>
        <Button variant="outline" onClick={testRun} disabled={busy}
          className="rounded-xl border-gray-200 text-gray-700">
          <Send size={16} className="ml-2" /> فحص واختبار الآن
        </Button>
      </div>
    </div>
  );
}
