import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Headset,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Ticket,
  X,
} from "lucide-react";
import { useAuthSession } from "../lib/useAuthSession";
import {
  SupportAttachmentList,
  SupportFilePicker,
} from "../components/SupportAttachments";
import {
  changeSupportStatus,
  createSupportTicket,
  getSupportStats,
  loadOlderSupportMessages,
  loadSupportProfile,
  replyToSupportTicket,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportError,
  watchSupportMessages,
  watchSupportTicket,
  watchSupportTickets,
  type SupportCursor,
  type SupportStats,
  type SupportMessage,
  type SupportPriority,
  type SupportProfile,
  type SupportStatus,
  type SupportTicket,
} from "../lib/support";

const field =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#D4AF37]/50";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#133B2E] px-5 py-3 text-sm font-bold text-white hover:bg-[#0d2a20] disabled:opacity-50";
const colors: Record<SupportStatus, string> = {
  OPEN: "bg-[#133B2E] text-white",
  IN_PROGRESS: "bg-[#D4AF37]/20 text-[#765c08]",
  WAITING: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-gray-100 text-gray-600",
};
const date = (value: SupportTicket["createdAt"]) =>
  value
    ?.toDate()
    .toLocaleString("ar-SA", {
      calendar: "gregory",
      dateStyle: "medium",
      timeStyle: "short",
    }) || "جارٍ الحفظ…";
function Status({ value, admin }: { value: SupportStatus; admin: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${colors[value]}`}
    >
      {value === "WAITING" && admin
        ? "بانتظار رد المستخدم"
        : SUPPORT_STATUSES[value]}
    </span>
  );
}

export default function SupportTickets() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const session = useAuthSession();
  const [profile, setProfile] = useState<SupportProfile | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [counts, setCounts] = useState<SupportStats | null>(null);
  const [countError, setCountError] = useState(false);
  const [cursors, setCursors] = useState<(SupportCursor | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<SupportCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [messageCursor, setMessageCursor] = useState<SupportCursor | null>(
    null,
  );
  const [hasOlder, setHasOlder] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const loadedOlder = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const activeTicket = useRef(ticketId);
  activeTicket.current = ticketId;
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [reply, setReply] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]);
  const [newPriority, setNewPriority] = useState<SupportPriority>("NORMAL");
  const isAdmin = profile?.isAdmin ?? false;

  useEffect(() => {
    if (session.state !== "authenticated") return;
    let active = true;
    setLoading(true);
    setError("");
    setTickets([]);
    setProfile(null);
    loadSupportProfile()
      .then((p) => {
        if (!active) return;
        setProfile(p);
      })
      .catch((err) => {
        if (active) {
          setError(supportError(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [session.state, session.user?.uid, retry]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    setCountError(false);
    const refresh = () => {
      if (!document.hidden)
        getSupportStats(profile)
          .then((data) => {
            if (active) setCounts(data);
          })
          .catch(() => {
            if (active) setCountError(true);
          });
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [profile, ticket?.status]);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    setError("");
    setTicket(null);
    const failed = (err: Error) => {
      setError(supportError(err));
      setLoading(false);
    };
    if (ticketId)
      return watchSupportTicket(
        ticketId,
        (data) => {
          setTicket(data);
          setLoading(false);
        },
        failed,
      );
    return watchSupportTickets(
      profile,
      { status, priority, search: searchTerm },
      cursors[page - 1] || null,
      (data, cursor, more) => {
        setTickets(data);
        setNextCursor(cursor);
        setHasMore(more);
        setLoading(false);
      },
      failed,
    );
  }, [profile, ticketId, status, priority, searchTerm, page, cursors]);

  useEffect(() => {
    setMessages([]);
    setReply("");
    setReplyFiles([]);
    setActionError("");
    setMessageError("");
    loadedOlder.current = false;
    if (!ticketId || !ticket?.id) return;
    setMessagesLoading(true);
    return watchSupportMessages(
      ticketId,
      (data, cursor, more) => {
        setMessages((previous) =>
          [
            ...new Map([...previous, ...data].map((m) => [m.id, m])).values(),
          ].sort(
            (a, b) =>
              (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0),
          ),
        );
        if (!loadedOlder.current) {
          setMessageCursor(cursor);
          setHasOlder(more);
        }
        setMessagesLoading(false);
      },
      (err) => {
        setMessageError(supportError(err));
        setMessagesLoading(false);
      },
    );
  }, [ticketId, ticket?.id, retry]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(search.trim());
      setPage(1);
      setCursors([null]);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!showNew) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setShowNew(false);
      if (event.key !== "Tab") return;
      const controls = modalRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      previousFocus?.focus();
    };
  }, [showNew, busy]);

  const stats = [
    {
      label: isAdmin ? "إجمالي التذاكر" : "إجمالي تذاكري",
      value: counts?.total,
      icon: Ticket,
      color: "text-[#D4AF37] bg-[#133B2E]",
    },
    {
      label: "قيد المتابعة",
      value: counts?.active,
      icon: Clock3,
      color: "text-[#133B2E] bg-[#D4AF37]",
    },
    {
      label: isAdmin ? "بانتظار رد المستخدم" : "بانتظار ردك",
      value: counts?.waiting,
      icon: MessageSquare,
      color: "text-white bg-amber-500",
    },
    {
      label: "تم حلها / مغلقة",
      value: counts?.closed,
      icon: CheckCircle2,
      color: "text-white bg-green-700",
    },
  ];

  async function older() {
    if (!ticketId || !messageCursor || olderBusy) return;
    const id = ticketId;
    setOlderBusy(true);
    try {
      const result = await loadOlderSupportMessages(id, messageCursor);
      if (activeTicket.current !== id) return;
      loadedOlder.current = true;
      setMessages((previous) => [
        ...new Map(
          [...result.messages, ...previous].map((m) => [m.id, m]),
        ).values(),
      ]);
      setMessageCursor(result.cursor);
      setHasOlder(result.hasMore);
    } catch (err) {
      if (activeTicket.current === id) setMessageError(supportError(err));
    } finally {
      setOlderBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!profile || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const id = await createSupportTicket(
        profile,
        { subject, description, category, priority: newPriority },
        newFiles,
      );
      setNewFiles([]);
      setShowNew(false);
      setSubject("");
      setDescription("");
      setCategory(SUPPORT_CATEGORIES[0]);
      setNewPriority("NORMAL");
      navigate(`/app/support/tickets/${id}`);
    } catch (err) {
      setActionError(supportError(err));
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!profile || !ticket || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await replyToSupportTicket(profile, ticket.id, reply, replyFiles);
      setReply("");
      setReplyFiles([]);
    } catch (err) {
      setActionError(supportError(err));
    } finally {
      setBusy(false);
    }
  }
  async function updateStatus(value: SupportStatus) {
    if (!ticket || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await changeSupportStatus(ticket.id, value);
    } catch (err) {
      setActionError(supportError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && (!profile || ticketId))
    return (
      <div className="flex items-center justify-center gap-3 py-24">
        <Loader2 className="animate-spin" /> جارٍ تحميل الدعم الفني…
      </div>
    );
  if (error)
    return (
      <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-700">
        {error}
        <button
          className="mr-4 underline"
          onClick={() => setRetry((r) => r + 1)}
        >
          إعادة المحاولة
        </button>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-4 font-sans text-[#133B2E]" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-l from-[#174b3a] to-[#0d2a20] p-6 text-white shadow-md md:p-7">
        <div className="flex max-w-3xl items-center gap-4">
          <div className="hidden rounded-full bg-white/15 p-4 text-amber-400 sm:block">
            <Headset size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-medium md:text-3xl">
              {isAdmin
                ? "إدارة الدعم الفني وتذاكر المساعدة"
                : "مركز الدعم الفني وتذاكر المساعدة"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/75">
              {isAdmin
                ? "تابع طلبات المستخدمين وردّ عليهم مباشرة من لوحة إدارة المنصة."
                : "افتح تذكرة في أي وقت وتواصل مباشرة مع فريق الدعم الفني لحل أي مشكلة تواجهك."}
            </p>
          </div>
        </div>
        {!isAdmin && (
          <button
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-3 text-sm font-bold text-[#133B2E] shadow hover:bg-[#c39e2f]"
            onClick={() => {
              setActionError("");
              setShowNew(true);
            }}
          >
            <Plus size={18} /> فتح تذكرة جديدة
          </button>
        )}
      </header>
      {!ticketId ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm"
              >
                <div className={`rounded-full p-3 ${s.color}`}>
                  <s.icon size={21} />
                </div>
                <div>
                  <p className="text-xs text-[#133B2E]/70">{s.label}</p>
                  <p className="mt-1 text-xl">{s.value ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
          {countError && (
            <p role="status" className="text-xs text-amber-700">
              تعذّر تحديث العدادات. يمكنك متابعة التذاكر أدناه.
            </p>
          )}
          <div className="grid gap-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:grid-cols-[1.4fr_1fr_0.8fr]">
            <div className="relative">
              <Search
                className="absolute right-4 top-4 text-[#133B2E]/55"
                size={19}
              />
              <input
                aria-label="البحث في التذاكر"
                className={`${field} h-14 pr-12`}
                placeholder="ابحث ببداية الموضوع أو #رقم التذكرة الكامل…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="relative">
              <span className="absolute -top-2 right-4 bg-white px-1 text-xs text-[#133B2E]/70">
                تصفية حسب الحالة
              </span>
              <select
                aria-label="تصفية حسب الحالة"
                className={`${field} h-14`}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                  setCursors([null]);
                }}
              >
                <option value="">جميع الحالات</option>
                {Object.entries(SUPPORT_STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {key === "WAITING" && isAdmin
                      ? "بانتظار رد المستخدم"
                      : label}
                  </option>
                ))}
              </select>
            </label>
            <label className="relative">
              <span className="absolute -top-2 right-4 bg-white px-1 text-xs text-[#133B2E]/70">
                الأولوية
              </span>
              <select
                aria-label="تصفية حسب الأولوية"
                className={`${field} h-14`}
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                  setCursors([null]);
                }}
              >
                <option value="">جميع الأولويات</option>
                {Object.entries(SUPPORT_PRIORITIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <section aria-label="قائمة التذاكر" className="space-y-3">
            {loading ? (
              <div className="flex justify-center p-16">
                <Loader2 className="animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="rounded-3xl bg-white px-6 py-16 text-center">
                <Ticket className="mx-auto mb-4 text-gray-300" size={48} />
                <h3 className="font-bold">
                  {searchTerm || status || priority
                    ? "لا توجد تذاكر تطابق البحث"
                    : "لا توجد تذاكر حتى الآن"}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {isAdmin
                    ? "ستظهر طلبات المستخدمين الجديدة هنا."
                    : "أنشئ تذكرة وسيساعدك فريق الدعم في حل استفسارك."}
                </p>
              </div>
            ) : (
              tickets.map((t) => (
                <Link
                  key={t.id}
                  to={`/app/support/tickets/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#133B2E]/20 bg-white p-5 shadow-sm transition hover:border-[#D4AF37] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className="rounded-full border border-gray-300 px-2 py-1 font-mono"
                        dir="ltr"
                      >
                        #{t.id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 ${["HIGH", "URGENT"].includes(t.priority) ? "bg-[#D4AF37] text-[#133B2E]" : "bg-[#133B2E]/10 text-[#133B2E]"}`}
                      >
                        {SUPPORT_PRIORITIES[t.priority]}
                      </span>
                      <span className="rounded-full bg-[#D4AF37]/10 px-2 py-1 text-[#765c08]">
                        {t.category}
                      </span>
                    </div>
                    <h2 className="break-words text-lg font-medium">
                      {t.subject}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-sm text-[#133B2E]/65">
                      {t.description}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#133B2E]/65">
                      {isAdmin && <span>مقدم الطلب: {t.requesterName}</span>}
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays size={13} /> تاريخ الإنشاء:{" "}
                        {date(t.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare size={13} /> عدد الرسائل:{" "}
                        {t.messageCount}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <Status value={t.status} admin={isAdmin} />
                    <ChevronLeft className="text-[#D4AF37]" size={21} />
                  </div>
                </Link>
              ))
            )}
            <div className="flex items-center justify-between p-3 text-sm text-[#133B2E]/70">
              <span>
                صفحة {page} · {tickets.length} تذاكر
              </span>
              <div className="flex gap-4">
                <button
                  disabled={loading || page === 1}
                  className="disabled:opacity-30"
                  onClick={() => setPage(page - 1)}
                >
                  السابق
                </button>
                <button
                  disabled={loading || !hasMore}
                  className="disabled:opacity-30"
                  onClick={() => {
                    setCursors((previous) => [
                      ...previous.slice(0, page),
                      nextCursor,
                    ]);
                    setPage(page + 1);
                  }}
                >
                  التالي
                </button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <Link
            to="/app/support/tickets"
            className="inline-flex items-center gap-2 text-sm"
          >
            <ArrowRight size={17} /> العودة إلى التذاكر
          </Link>
          {!ticket ? (
            <div role="alert" className="rounded-2xl bg-white p-10 text-center">
              التذكرة غير موجودة أو لا تملك صلاحية الاطلاع عليها.
            </div>
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_290px]">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 p-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-gray-400">
                      #{ticket.id}
                    </span>
                    <div className="flex items-center gap-3">
                      <Status value={ticket.status} admin={isAdmin} />
                      {!isAdmin &&
                        !["CLOSED", "RESOLVED"].includes(ticket.status) && (
                          <button
                            disabled={busy}
                            onClick={() => updateStatus("CLOSED")}
                            className="text-xs text-red-600 underline"
                          >
                            إغلاق التذكرة
                          </button>
                        )}
                    </div>
                  </div>
                  <h2 className="break-words text-xl font-bold">
                    {ticket.subject}
                  </h2>
                </div>
                <div className="space-y-5 p-5 md:p-6">
                  <article className="rounded-2xl bg-gray-50 p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <strong>{ticket.requesterName} · مقدم الطلب</strong>
                      <time className="text-gray-400">
                        {date(ticket.createdAt)}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">
                      {ticket.description}
                    </p>
                    <SupportAttachmentList files={ticket.attachments} />
                  </article>
                  {hasOlder && (
                    <button
                      disabled={olderBusy}
                      onClick={older}
                      className="block mx-auto text-sm text-[#133B2E] underline"
                    >
                      {olderBusy ? "جارٍ التحميل…" : "تحميل رسائل أقدم"}
                    </button>
                  )}
                  {messagesLoading && (
                    <p className="text-sm text-gray-400">
                      جارٍ تحميل المحادثة…
                    </p>
                  )}
                  {messageError && (
                    <p role="alert" className="text-sm text-red-600">
                      {messageError}
                      <button
                        className="mr-3 underline"
                        onClick={() => setRetry((r) => r + 1)}
                      >
                        إعادة المحاولة
                      </button>
                    </p>
                  )}
                  {messages.map((m) => (
                    <article
                      key={m.id}
                      className={`rounded-2xl border p-5 ${m.isAdmin ? "border-emerald-100 bg-emerald-50/60" : "border-gray-100 bg-gray-50"}`}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <strong>
                          {m.isAdmin
                            ? "الدعم الفني · إدارة المنصة"
                            : m.senderName}
                        </strong>
                        <time className="text-gray-400">
                          {date(m.createdAt)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">
                        {m.body}
                      </p>
                      <SupportAttachmentList files={m.attachments} />
                    </article>
                  ))}
                </div>
                <div className="border-t border-gray-100 p-6">
                  {actionError && (
                    <p role="alert" className="mb-3 text-sm text-red-600">
                      {actionError}
                    </p>
                  )}
                  {["CLOSED", "RESOLVED"].includes(ticket.status) ? (
                    <div className="text-sm text-gray-500">
                      تم {ticket.status === "CLOSED" ? "إغلاق" : "حل"} التذكرة.{" "}
                      {isAdmin ? (
                        "يمكنك إعادة فتحها من قائمة الحالة."
                      ) : (
                        <button
                          disabled={busy}
                          className="font-bold text-[#133B2E] underline"
                          onClick={() => updateStatus("OPEN")}
                        >
                          إعادة فتح التذكرة
                        </button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={send}>
                      <label
                        htmlFor="support-reply"
                        className="mb-3 block text-sm font-bold"
                      >
                        {isAdmin ? "الرد على المستخدم" : "إضافة رد"}
                      </label>
                      <textarea
                        id="support-reply"
                        className={`${field} min-h-32 resize-y`}
                        required={!replyFiles.length}
                        maxLength={10000}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="اكتب ردك هنا…"
                      />
                      <div className="mt-3">
                        <SupportFilePicker
                          files={replyFiles}
                          onChange={setReplyFiles}
                          disabled={busy}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-400">
                          {reply.length} / 10000
                        </span>
                        <button
                          className={primary}
                          disabled={
                            busy ||
                            (!reply.trim() && !replyFiles.length) ||
                            !!messageError
                          }
                        >
                          {busy ? (
                            <Loader2 className="animate-spin" size={17} />
                          ) : (
                            <Send size={17} />
                          )}{" "}
                          إرسال الرد
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>
              <aside className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6">
                <h3 className="font-bold">بيانات التذكرة</h3>
                {[
                  ["مقدم الطلب", ticket.requesterName],
                  ["التصنيف", ticket.category],
                  ["الأولوية", SUPPORT_PRIORITIES[ticket.priority]],
                  ["تاريخ الإنشاء", date(ticket.createdAt)],
                  ["آخر تحديث", date(ticket.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="mb-1 text-xs text-gray-400">{label}</p>
                    <p className="break-words text-sm">{value}</p>
                  </div>
                ))}
                {isAdmin && (
                  <div className="border-t border-gray-100 pt-4">
                    <label
                      htmlFor="ticket-status"
                      className="mb-2 block text-sm font-bold"
                    >
                      تغيير الحالة
                    </label>
                    <select
                      id="ticket-status"
                      disabled={busy}
                      className={field}
                      value={ticket.status}
                      onChange={(e) =>
                        updateStatus(e.target.value as SupportStatus)
                      }
                    >
                      {Object.entries(SUPPORT_STATUSES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {key === "WAITING" ? "بانتظار رد المستخدم" : label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </aside>
            </div>
          )}
        </>
      )}

      {showNew && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-ticket-title"
            className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 id="new-ticket-title" className="text-xl font-bold">
                تذكرة دعم جديدة
              </h2>
              <button
                aria-label="إغلاق"
                disabled={busy}
                onClick={() => setShowNew(false)}
              >
                <X size={22} />
              </button>
            </div>
            <form onSubmit={create} className="space-y-4">
              <label className="block text-sm font-medium">
                عنوان التذكرة
                <input
                  autoFocus
                  className={`${field} mt-2`}
                  required
                  minLength={3}
                  maxLength={200}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="اكتب عنوانًا مختصرًا للمشكلة"
                />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  التصنيف
                  <select
                    className={`${field} mt-2`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {SUPPORT_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  الأولوية
                  <select
                    className={`${field} mt-2`}
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as SupportPriority)
                    }
                  >
                    {Object.entries(SUPPORT_PRIORITIES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">
                تفاصيل الطلب
                <textarea
                  className={`${field} mt-2 min-h-40`}
                  required
                  minLength={10}
                  maxLength={3000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وضّح المشكلة والخطوات التي أدت إلى ظهورها…"
                />
              </label>
              <SupportFilePicker
                files={newFiles}
                onChange={setNewFiles}
                disabled={busy}
              />
              {actionError && (
                <p role="alert" className="text-sm text-red-600">
                  {actionError}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border px-5 py-3 text-sm"
                  onClick={() => setShowNew(false)}
                >
                  إلغاء
                </button>
                <button disabled={busy} className={primary}>
                  {busy ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Plus size={18} />
                  )}{" "}
                  إرسال التذكرة
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
