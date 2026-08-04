/**
 * إدارة بوابة العميل من جانب المكتب — الوثيقة §2.7.
 * ثلاثة تبويبات: الحسابات · الطلبات · الرسائل.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  UserPlus, ShieldAlert, RefreshCw, AlertTriangle, Send, X, Save,
  Inbox, MessageSquare, Users, CheckCircle2, XCircle, Lock, Scale,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { usePermissions } from "../lib/usePermissions";
import { fetchClientOptions, type ClientOption } from "../lib/links";
import {
  DEFAULT_PORTAL_PERMISSIONS, PORTAL_ENABLED, PORTAL_PERMISSION_LABELS_AR,
  PORTAL_STATUS_COLORS, PORTAL_STATUS_LABELS_AR,
  REQUEST_STATUS_COLORS, REQUEST_STATUS_LABELS_AR, REQUEST_TYPE_LABELS_AR,
  groupByClient, invitePortalAccount, isValidEmail, listClientRequests,
  listMessages, listPortalAccounts, sendOfficeMessage, setPortalAccountStatus,
  setRequestStatus, unreadFromClients, updatePortalPermissions,
  type ClientMessage, type ClientRequest, type PortalAccount, type PortalPermissions,
} from "../lib/clientPortal";

type Tab = "accounts" | "requests" | "messages";

export default function ClientPortalAdmin() {
  const perms = usePermissions();
  const canView = perms.can("client.manage");
  const canManage = perms.scopeOf("users.manage") === "FULL";

  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [permsFor, setPermsFor] = useState<PortalAccount | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (!perms.lawyerId) return;
      const [a, r, m] = await Promise.all([
        listPortalAccounts(perms.lawyerId),
        listClientRequests(perms.lawyerId),
        listMessages(perms.lawyerId),
      ]);
      setAccounts(a); setRequests(r); setMessages(m);
    } catch (err) {
      console.error(err);
      setError("تعذّر تحميل بيانات البوابة.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canView]);

  const threads = useMemo(() => groupByClient(messages), [messages]);
  const newRequests = requests.filter((r) => r.status === "NEW").length;
  const unread = unreadFromClients(messages);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية إدارة بوابة العملاء</h2>
      </div>
    );
  }

  const sendReply = async (clientId: string) => {
    const body = reply.trim();
    if (!body || !perms.lawyerId) return;
    setBusy(clientId);
    try {
      const name = accounts.find((a) => a.clientId === clientId)?.clientName
        ?? threads.get(clientId)?.[0]?.clientName ?? null;
      await sendOfficeMessage({
        lawyerId: perms.lawyerId, clientId, clientName: name,
        caseId: null, body,
        senderId: perms.userId, senderName: localStorage.getItem("userName") ?? null,
      });
      setReply("");
      await load();
    } catch (err) {
      console.error(err);
      setError("تعذّر إرسال الرد.");
    } finally { setBusy(null); }
  };

  const TabBtn = ({ id, label, icon, badge }: { id: Tab; label: string; icon: React.ReactNode; badge?: number }) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition ${
        tab === id ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}>
      {icon} {label}
      {badge ? (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">{badge}</span>
      ) : null}
    </button>
  );

  return (
    <div className="space-y-5 font-['Tajawal']" dir="rtl">
      {inviteOpen && (
        <InviteModal onClose={() => setInviteOpen(false)}
          onDone={async () => { setInviteOpen(false); await load(); }} />
      )}
      {permsFor && (
        <PermissionsModal account={permsFor} onClose={() => setPermsFor(null)}
          onDone={async () => { setPermsFor(null); await load(); }} />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">بوابة العملاء</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {accounts.length} حساب · {newRequests} طلب جديد · {unread} رسالة غير مقروءة
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-xl border-gray-200">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)} className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg">
              <UserPlus className="ml-2 h-4 w-4" /> دعوة عميل
            </Button>
          )}
        </div>
      </div>

      {!PORTAL_ENABLED && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          <Lock size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold">البوابة الخارجية غير مفعّلة بعد</p>
            <p className="text-xs mt-1 leading-relaxed">
              تُسجَّل الدعوات والصلاحيات من الآن، لكن دخول العميل من الخارج يبقى مغلقاً حتى
              تكتمل قواعد حماية قاعدة البيانات. فتحه قبل ذلك يعني أن أي حساب عميل يستطيع
              قراءة بيانات المكتب كاملة مهما ضيّقنا الواجهة — وهذا خطر حقيقي لا شكلي.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <TabBtn id="accounts" label="الحسابات" icon={<Users size={15} />} />
        <TabBtn id="requests" label="الطلبات" icon={<Inbox size={15} />} badge={newRequests} />
        <TabBtn id="messages" label="الرسائل" icon={<MessageSquare size={15} />} badge={unread} />
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4">
          <h2 className="font-bold text-lg text-[#133B2E]">
            {tab === "accounts" ? "حسابات البوابة" : tab === "requests" ? "طلبات العملاء" : "المحادثات"}
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : tab === "accounts" ? (
            accounts.length === 0 ? (
              <Empty icon={<Users size={30} />} text="لا حسابات بوابة بعد"
                hint={canManage ? "اضغط «دعوة عميل» لتسجيل أول دعوة" : ""} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {accounts.map((a) => (
                  <li key={a.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3 hover:bg-gray-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${PORTAL_STATUS_COLORS[a.status]}`}>
                          {PORTAL_STATUS_LABELS_AR[a.status]}
                        </span>
                        <span className="text-xs text-gray-400" dir="ltr">{a.email}</span>
                      </div>
                      <p className="font-bold text-[#133B2E] mt-1">{a.clientName || "عميل"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(a.allowedCaseIds ?? []).length === 0 ? "كل قضاياه" : `${a.allowedCaseIds.length} قضية محددة`}
                        {" · "}
                        {Object.entries(a.permissions ?? {}).filter(([, v]) => v).length} صلاحية مفعّلة
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 flex-wrap shrink-0">
                        <Button variant="outline" size="sm" onClick={() => setPermsFor(a)}
                          className="rounded-xl border-gray-200 text-gray-700 text-xs">
                          الصلاحيات
                        </Button>
                        {a.status !== "SUSPENDED" ? (
                          <Button variant="ghost" size="sm" disabled={busy === a.id}
                            onClick={async () => { setBusy(a.id); await setPortalAccountStatus(a, "SUSPENDED"); await load(); setBusy(null); }}
                            className="rounded-xl text-orange-600 hover:bg-orange-50 text-xs">
                            <XCircle size={13} className="ml-1" /> إيقاف
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled={busy === a.id}
                            onClick={async () => { setBusy(a.id); await setPortalAccountStatus(a, "INVITED"); await load(); setBusy(null); }}
                            className="rounded-xl text-green-700 hover:bg-green-50 text-xs">
                            <CheckCircle2 size={13} className="ml-1" /> إعادة تفعيل
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : tab === "requests" ? (
            requests.length === 0 ? (
              <Empty icon={<Inbox size={30} />} text="لا طلبات من العملاء"
                hint="تصل الطلبات هنا فور تفعيل البوابة" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {requests.map((r) => (
                  <li key={r.id} className="p-4 hover:bg-gray-50/50">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${REQUEST_STATUS_COLORS[r.status]}`}>
                            {REQUEST_STATUS_LABELS_AR[r.status]}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {REQUEST_TYPE_LABELS_AR[r.type]}
                          </span>
                          <span className="text-xs text-gray-400">{r.clientName}</span>
                        </div>
                        <p className="font-bold text-[#133B2E] mt-1">{r.subject}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{r.body}</p>
                        {r.caseId && (
                          <Link to={`/app/cases/${r.caseId}`}
                            className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-indigo-700 hover:underline">
                            <Scale size={12} /> {r.caseTitle || "القضية"}
                          </Link>
                        )}
                      </div>
                      {canManage && r.status !== "RESOLVED" && r.status !== "REJECTED" && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="sm" disabled={busy === r.id}
                            onClick={async () => { setBusy(r.id); await setRequestStatus(r, "IN_PROGRESS"); await load(); setBusy(null); }}
                            className="rounded-xl border-amber-200 text-amber-700 text-xs">
                            قيد المعالجة
                          </Button>
                          <Button variant="outline" size="sm" disabled={busy === r.id}
                            onClick={async () => {
                              const res = prompt("رد المكتب (اختياري):");
                              if (res === null) return;
                              setBusy(r.id); await setRequestStatus(r, "RESOLVED", res); await load(); setBusy(null);
                            }}
                            className="rounded-xl border-green-200 text-green-700 text-xs">
                            <CheckCircle2 size={13} className="ml-1" /> إنجاز
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            threads.size === 0 ? (
              <Empty icon={<MessageSquare size={30} />} text="لا محادثات بعد"
                hint="تظهر رسائل العملاء هنا فور تفعيل البوابة" />
            ) : (
              <div className="divide-y divide-gray-100">
                {[...threads.entries()].map(([clientId, msgs]) => {
                  const open = activeThread === clientId;
                  const name = msgs[0]?.clientName || "عميل";
                  const pending = msgs.filter((m) => m.senderType === "CLIENT" && !m.readAt).length;
                  return (
                    <div key={clientId}>
                      <button onClick={() => setActiveThread(open ? null : clientId)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50/60 text-right transition">
                        <div className="w-9 h-9 rounded-full bg-[#133B2E] text-[#D4AF37] flex items-center justify-center shrink-0">
                          <MessageSquare size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#133B2E]">{name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {msgs[msgs.length - 1]?.body.slice(0, 80)}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{msgs.length} رسالة</span>
                        {pending > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white shrink-0">
                            {pending}
                          </span>
                        )}
                      </button>
                      {open && (
                        <div className="bg-gray-50/60 p-4 space-y-2 border-t border-gray-100">
                          <div className="max-h-72 overflow-y-auto space-y-2">
                            {msgs.map((m) => (
                              <div key={m.id}
                                className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                                  m.senderType === "OFFICE"
                                    ? "bg-[#133B2E] text-white mr-auto"
                                    : "bg-white border border-gray-200 text-gray-800"
                                }`}>
                                <p className="text-[10px] opacity-70 mb-1">
                                  {m.senderName || (m.senderType === "OFFICE" ? "المكتب" : name)} ·{" "}
                                  {new Date(m.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                                </p>
                                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                              </div>
                            ))}
                          </div>
                          {canManage && (
                            <div className="flex gap-2 pt-2">
                              <input value={reply} onChange={(e) => setReply(e.target.value)}
                                placeholder="اكتب ردّك..."
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:border-[#133B2E]" />
                              <Button disabled={busy === clientId || !reply.trim()}
                                onClick={() => void sendReply(clientId)}
                                className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white rounded-2xl">
                                <Send size={15} className="ml-1" /> إرسال
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty({ icon, text, hint }: { icon: React.ReactNode; text: string; hint?: string }) {
  return (
    <div className="p-12 text-center flex flex-col items-center gap-2 text-gray-400">
      <span className="text-gray-300">{icon}</span>
      <p className="font-medium text-gray-500">{text}</p>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  );
}

/* ────────────────────────── الدعوة ────────────────────────── */

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const perms = usePermissions();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (perms.lawyerId) void fetchClientOptions(perms.lawyerId).then(setClients);
  }, [perms.lawyerId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) { setErr("اختر العميل"); return; }
    if (!isValidEmail(email)) { setErr("البريد الإلكتروني غير صالح"); return; }
    if (!perms.lawyerId) { setErr("تعذّر تحديد المكتب."); return; }
    setBusy(true); setErr("");
    try {
      await invitePortalAccount({
        lawyerId: perms.lawyerId, clientId,
        clientName: clients.find((c) => c.id === clientId)?.label ?? "عميل",
        email, phone: phone || null, invitedBy: perms.userId,
      });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "تعذّر تسجيل الدعوة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">دعوة عميل للبوابة</h2>
              <p className="text-xs text-[#D4AF37]">تُسجَّل الدعوة الآن ويُفعَّل الدخول عند فتح البوابة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {err && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{err}</span>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">العميل *</label>
            <select required value={clientId} className={field} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— اختر العميل —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">البريد الإلكتروني *</label>
            <input type="email" required value={email} className={field} dir="ltr"
              placeholder="client@example.com" onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">الجوال</label>
            <input value={phone} className={field} dir="ltr" placeholder="05xxxxxxxx"
              onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" /> {busy ? "جاري التسجيل..." : "تسجيل الدعوة"}
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

/* ────────────────────────── صلاحيات الحساب ────────────────────────── */

function PermissionsModal({
  account, onClose, onDone,
}: { account: PortalAccount; onClose: () => void; onDone: () => void }) {
  const [p, setP] = useState<PortalPermissions>({ ...DEFAULT_PORTAL_PERMISSIONS, ...account.permissions });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updatePortalPermissions(account, p);
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center">
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">صلاحيات {account.clientName}</h2>
            <p className="text-xs text-[#D4AF37]">ما يستطيع العميل فعله داخل البوابة</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full shrink-0"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-2">
          {(Object.keys(PORTAL_PERMISSION_LABELS_AR) as (keyof PortalPermissions)[]).map((k) => (
            <label key={k} className="flex items-center justify-between p-3 rounded-2xl border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <span className="text-sm font-bold text-gray-700">{PORTAL_PERMISSION_LABELS_AR[k]}</span>
              <input type="checkbox" checked={p[k]} className="w-5 h-5 accent-[#133B2E]"
                onChange={(e) => setP({ ...p, [k]: e.target.checked })} />
            </label>
          ))}
          <Button onClick={save} disabled={busy}
            className="w-full py-6 mt-3 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
            <Save size={16} className="ml-2" /> {busy ? "جاري الحفظ..." : "حفظ الصلاحيات"}
          </Button>
        </div>
      </div>
    </div>
  );
}
