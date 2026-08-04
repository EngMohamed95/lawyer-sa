/** إضافة موعد — الوثيقة §1.8. يحذّر من التعارض ولا يمنعه. */

import { useEffect, useMemo, useState } from "react";
import { X, CalendarPlus, AlertTriangle, Save, Repeat, Video, MapPin } from "lucide-react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button } from "./ui/button";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { fetchCaseOptions, fetchClientOptions, type CaseOption, type ClientOption } from "../lib/links";
import {
  APPOINTMENT_TYPE_LABELS_AR, RECURRENCE_LABELS_AR, SOURCE_LABELS_AR,
  findConflicts, timeLabel,
  type AppointmentType, type CalendarEvent, type RecurrenceFreq,
} from "../lib/calendar";

interface Props {
  onClose: () => void;
  onDone: () => void;
  /** أحداث التقويم الحالية — تُستخدم لكشف التعارض */
  existing: CalendarEvent[];
  defaultDate?: string | null;
  defaultCaseId?: string | null;
  defaultClientId?: string | null;
}

export default function AddAppointmentModal({
  onClose, onDone, existing, defaultDate = null,
  defaultCaseId = null, defaultClientId = null,
}: Props) {
  const perms = usePermissions();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const today = defaultDate ?? new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: "", description: "", type: "CLIENT_MEETING" as AppointmentType,
    date: today, startTime: "10:00", endTime: "11:00", allDay: false,
    location: "", isOnline: false, meetingUrl: "",
    clientId: defaultClientId ?? "", caseId: defaultCaseId ?? "",
    repeat: "" as "" | RecurrenceFreq, interval: "1", count: "",
    remindDayBefore: true, remindHourBefore: true,
  });

  useEffect(() => {
    if (!perms.lawyerId) return;
    const lawyerId = perms.lawyerId;
    void (async () => {
      const [cl, cs] = await Promise.all([fetchClientOptions(lawyerId), fetchCaseOptions(lawyerId)]);
      setClients(cl);
      setCases(cs);
      if (defaultCaseId && !defaultClientId) {
        const linked = cs.find((c) => c.id === defaultCaseId);
        if (linked?.clientId) setForm((f) => ({ ...f, clientId: linked.clientId }));
      }
    })();
  }, [perms.lawyerId, defaultCaseId, defaultClientId]);

  const casesForClient = form.clientId ? cases.filter((c) => c.clientId === form.clientId) : cases;

  const startAt = form.allDay ? `${form.date}T00:00:00` : `${form.date}T${form.startTime}:00`;
  const endAt = form.allDay ? `${form.date}T23:59:59` : `${form.date}T${form.endTime}:00`;

  /** التعارض يُحسب فور تغيّر الوقت — تحذير مباشر قبل الحفظ */
  const conflicts = useMemo(() => {
    if (!form.date) return [];
    return findConflicts(existing, startAt, endAt);
  }, [existing, startAt, endAt, form.date]);

  const validate = (): string => {
    if (!form.title.trim()) return "عنوان الموعد مطلوب";
    if (!form.date) return "التاريخ مطلوب";
    if (!form.allDay && form.endTime <= form.startTime) return "وقت الانتهاء يجب أن يكون بعد البداية";
    if (form.isOnline && form.meetingUrl && !/^https?:\/\//i.test(form.meetingUrl))
      return "رابط الاجتماع يجب أن يبدأ بـ http أو https";
    if (form.repeat && Number(form.interval) < 1) return "فاصل التكرار لا يقل عن ١";
    return "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setErr(v); return; }
    if (!perms.lawyerId) { setErr("تعذّر تحديد المكتب."); return; }

    setBusy(true);
    setErr("");
    try {
      const client = clients.find((c) => c.id === form.clientId);
      const linkedCase = form.caseId ? cases.find((c) => c.id === form.caseId) : undefined;
      const now = new Date().toISOString();

      const reminders: { minutesBefore: number; channels: string[] }[] = [];
      if (form.remindDayBefore) reminders.push({ minutesBefore: 1440, channels: ["IN_APP"] });
      if (form.remindHourBefore) reminders.push({ minutesBefore: 60, channels: ["IN_APP"] });

      await addDoc(collection(db, "appointments"), {
        lawyerId: perms.lawyerId,
        title: form.title.trim(),
        description: form.description || null,
        type: form.type,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        allDay: form.allDay,
        timezone: "Asia/Riyadh",
        location: form.location || null,
        isOnline: form.isOnline,
        meetingUrl: form.isOnline ? (form.meetingUrl || null) : null,
        clientId: form.clientId || null,
        clientName: client?.label ?? null,
        caseId: form.caseId || null,
        caseTitle: linkedCase?.label ?? null,
        caseNumber: linkedCase?.caseNumber || null,
        organizerId: perms.userId,
        organizerName: localStorage.getItem("userName") ?? null,
        attendees: [],
        reminders,
        recurrence: form.repeat
          ? {
              freq: form.repeat,
              interval: Number(form.interval) || 1,
              count: form.count ? Number(form.count) : null,
              until: null,
            }
          : null,
        recurrenceParentId: null,
        status: "SCHEDULED",
        outcome: null,
        color: null,
        createdAt: now,
        createdBy: perms.userId,
        updatedAt: now,
        deletedAt: null,
      });

      await writeAudit({
        action: "CREATE", entity: "appointment", entityId: null,
        entityLabel: `${form.title.trim()} — ${form.date}`,
        after: {
          النوع: APPOINTMENT_TYPE_LABELS_AR[form.type],
          الوقت: form.allDay ? "يوم كامل" : `${form.startTime}–${form.endTime}`,
          العميل: client?.label ?? "—",
          القضية: linkedCase?.label ?? "غير مرتبط",
          "تعارضات وقت الحفظ": conflicts.length,
        },
      });

      onDone();
    } catch (e2) {
      console.error(e2);
      setErr("تعذّر حفظ الموعد. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <CalendarPlus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">موعد جديد</h2>
              <p className="text-xs text-[#D4AF37]">يظهر في التقويم الموحّد مع الجلسات والمهام</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>

        <form onSubmit={submit} className="p-6 md:p-8 space-y-5">
          {err && (
            <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" /> <span>{err}</span>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle size={16} /> تعارض مع {conflicts.length} حدث في نفس الوقت
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {conflicts.slice(0, 4).map((c) => (
                  <li key={c.event.id} className="flex items-center gap-2">
                    <span className="font-bold">{SOURCE_LABELS_AR[c.event.source]}</span>
                    <span>{c.event.title}</span>
                    <span className="text-amber-700">
                      {c.event.allDay ? "(يوم كامل)" : `(${timeLabel(c.event.start)})`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] mt-2 text-amber-700">
                تحذير فقط — تستطيع الحفظ إن كنت تقصد ذلك.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-gray-700">عنوان الموعد *</label>
              <input required value={form.title} className={field} placeholder="مثال: اجتماع مراجعة عقد التوريد"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">النوع</label>
              <select value={form.type} className={field}
                onChange={(e) => setForm({ ...form, type: e.target.value as AppointmentType })}>
                {Object.entries(APPOINTMENT_TYPE_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">التاريخ *</label>
              <input type="date" required value={form.date} className={field}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>

            {!form.allDay && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">من</label>
                  <input type="time" value={form.startTime} className={field}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">إلى</label>
                  <input type="time" value={form.endTime} className={field}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </>
            )}

            <div className="md:col-span-2 flex items-center gap-2">
              <input id="allDay" type="checkbox" checked={form.allDay} className="w-5 h-5 accent-[#133B2E]"
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
              <label htmlFor="allDay" className="text-sm font-bold text-gray-700 cursor-pointer">يوم كامل</label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">
                العميل <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <select value={form.clientId} className={field}
                onChange={(e) => setForm({ ...form, clientId: e.target.value, caseId: "" })}>
                <option value="">— بلا عميل —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">
                القضية <span className="font-normal text-gray-400">(اختياري)</span>
              </label>
              <select value={form.caseId} className={field}
                onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
                <option value="">— بلا قضية —</option>
                {casesForClient.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber ? `${c.caseNumber} — ${c.label}` : c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
            <div className="flex items-center gap-2">
              <input id="isOnline" type="checkbox" checked={form.isOnline} className="w-5 h-5 accent-[#133B2E]"
                onChange={(e) => setForm({ ...form, isOnline: e.target.checked })} />
              <label htmlFor="isOnline" className="text-sm font-bold text-gray-700 cursor-pointer flex items-center gap-1">
                <Video size={15} /> اجتماع عن بُعد
              </label>
            </div>
            {form.isOnline ? (
              <input value={form.meetingUrl} className={field} placeholder="https://meet.example.com/..." dir="ltr"
                onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} />
            ) : (
              <div className="relative">
                <MapPin size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.location} className={`${field} pr-9`} placeholder="المكان — مثال: مقر المكتب، الدور الثالث"
                  onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <Repeat size={15} /> التكرار
            </div>
            <div className="grid grid-cols-3 gap-3">
              <select value={form.repeat} className={field}
                onChange={(e) => setForm({ ...form, repeat: e.target.value as "" | RecurrenceFreq })}>
                <option value="">بلا تكرار</option>
                {Object.entries(RECURRENCE_LABELS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {form.repeat && (
                <>
                  <input type="number" min="1" max="12" value={form.interval} className={field} placeholder="كل"
                    onChange={(e) => setForm({ ...form, interval: e.target.value })} title="كل كم مرة" />
                  <input type="number" min="1" max="100" value={form.count} className={field} placeholder="عدد المرات"
                    onChange={(e) => setForm({ ...form, count: e.target.value })} title="عدد التكرارات" />
                </>
              )}
            </div>
            {form.repeat && (
              <p className="text-xs text-gray-500">
                يتكرر {RECURRENCE_LABELS_AR[form.repeat]} كل {form.interval || 1}
                {form.count ? ` — ${form.count} مرة` : " — حتى ٢٠٠ مرة كحد أقصى"}
              </p>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
            <p className="text-sm font-bold text-gray-700">التذكيرات</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.remindDayBefore} className="w-4 h-4 accent-[#133B2E]"
                  onChange={(e) => setForm({ ...form, remindDayBefore: e.target.checked })} />
                قبل يوم
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.remindHourBefore} className="w-4 h-4 accent-[#133B2E]"
                  onChange={(e) => setForm({ ...form, remindHourBefore: e.target.checked })} />
                قبل ساعة
              </label>
            </div>
            <p className="text-xs text-gray-400">
              التذكيرات تُحفظ مع الموعد؛ إرسالها الفعلي يأتي مع محرك التنبيهات.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">ملاحظات</label>
            <textarea rows={2} value={form.description} className={field} placeholder="تفاصيل إضافية..."
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" />
              {busy ? "جاري الحفظ..." : conflicts.length > 0 ? "حفظ رغم التعارض" : "حفظ الموعد"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}
              className="flex-1 py-6 border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50">
              إلغاء
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
