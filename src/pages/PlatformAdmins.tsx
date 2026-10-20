/**
 * فريق مديري المنصة (SaaS Admins) — حسابات SUPER_ADMIN.
 * الدور الإداري (adminRole) للتنظيم والتعريف فقط: كل مديري المنصة يملكون صلاحياتها كاملة.
 * الحساب المعطّل (status: DISABLED) يُمنع من تسجيل الدخول.
 */

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Loader2, Pencil, ShieldCheck, UserCog, UserPlus } from "lucide-react";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { db, firebaseConfig } from "../lib/firebase";
import { Input } from "../components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AdminHeader, AdminModal, HeaderButton, adminPanel, fmtDate, fmtDateTime } from "../components/admin/AdminUi";

const ADMIN_ROLES: Record<string, { label: string; className: string }> = {
  OWNER: { label: "مدير عام للمنصة", className: "bg-amber-100 text-amber-700" },
  SUPPORT: { label: "فريق الدعم الفني", className: "bg-blue-100 text-blue-700" },
  BILLING: { label: "المالية والاشتراكات", className: "bg-emerald-100 text-emerald-700" },
  OPERATIONS: { label: "العمليات والمحتوى", className: "bg-cyan-100 text-cyan-700" },
};

interface AdminRow {
  id: string;
  name: string;
  email: string;
  phone?: string;
  adminRole?: string;
  status?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

const label = "text-xs font-bold text-slate-600";
const selectClass = "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 text-sm";

export default function PlatformAdmins() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", adminRole: "SUPPORT" });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const myId = localStorage.getItem("userId");

  const refresh = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "users"), where("role", "==", "SUPER_ADMIN")));
      setAdmins(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))));
    } catch (err: any) {
      alert("تعذّر تحميل الفريق: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) { alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setSaving(true);
    // تطبيق ثانوي حتى لا يُسجَّل خروج المدير الحالي عند إنشاء الحساب الجديد
    const secondaryApp = initializeApp(firebaseConfig, "AdminApp_" + Date.now());
    try {
      const cred = await createUserWithEmailAndPassword(getAuth(secondaryApp), form.email.trim(), form.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: "SUPER_ADMIN",
        adminRole: form.adminRole,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
      });
      setAdding(false);
      setForm({ name: "", email: "", password: "", phone: "", adminRole: "SUPPORT" });
      await refresh();
    } catch (err: any) {
      alert("خطأ: " + (err?.code === "auth/email-already-in-use" ? "البريد مستخدم بالفعل" : err?.message || err));
    } finally {
      await deleteApp(secondaryApp).catch(() => {});
      setSaving(false);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", editing.id), { name: editing.name, phone: editing.phone || "", adminRole: editing.adminRole || "SUPPORT" });
      setEditing(null);
      await refresh();
    } catch (err: any) { alert("خطأ: " + (err?.message || err)); }
    finally { setSaving(false); }
  };

  const activeAdmins = admins.filter((a) => a.status !== "DISABLED").length;

  const toggle = async (a: AdminRow) => {
    const disabling = a.status !== "DISABLED";
    if (disabling && a.id === myId) { alert("لا يمكنك تعطيل حسابك الحالي."); return; }
    if (disabling && activeAdmins <= 1) { alert("لا يمكن تعطيل آخر مدير نشط للمنصة."); return; }
    if (disabling && !confirm(`تعطيل حساب «${a.name}»؟ لن يتمكن من تسجيل الدخول حتى إعادة التفعيل.`)) return;
    setBusyId(a.id);
    try {
      const status = disabling ? "DISABLED" : "ACTIVE";
      await updateDoc(doc(db, "users", a.id), { status });
      setAdmins((all) => all.map((x) => (x.id === a.id ? { ...x, status } : x)));
    } catch (err: any) { alert("خطأ: " + (err?.message || err)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6 font-['Tajawal'] text-[#192a56]" dir="rtl">
      <AdminHeader
        icon={<UserCog size={26} />}
        title="فريق مديري المنصة (SaaS Admins)"
        subtitle="إدارة حسابات المشرفين والمديرين ومسؤولي الدعم الفني للمنصة وتحديد أدوارهم."
        actions={<HeaderButton onClick={() => setAdding(true)}><UserPlus size={16} /> إضافة مدير جديد</HeaderButton>}
      />

      <div className={`${adminPanel} overflow-hidden`}>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#273c75]" /></div>
        ) : admins.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">لا يوجد مديرون.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-right">
                <tr>
                  {["الاسم", "البريد الإلكتروني", "الدور الإداري", "الهاتف", "تاريخ الإنشاء", "آخر دخول", "الحالة", "إجراءات"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((a) => {
                  const role = ADMIN_ROLES[a.adminRole || ""] || ADMIN_ROLES.OWNER;
                  const disabled = a.status === "DISABLED";
                  return (
                    <tr key={a.id} className={`hover:bg-slate-50 ${disabled ? "opacity-70" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-bold">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><ShieldCheck size={14} /></span>
                          {a.name || "—"}
                          {a.id === myId && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">أنت</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3" dir="ltr" style={{ textAlign: "right" }}>{a.email}</td>
                      <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${role.className}`}>{role.label}</span></td>
                      <td className="px-4 py-3 tabular-nums" dir="ltr" style={{ textAlign: "right" }}>{a.phone || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{fmtDate(a.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${disabled ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>{disabled ? "معطل" : "نشط"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setEditing({ ...a })} title="تعديل" className="rounded-lg border border-blue-200 p-1.5 text-blue-600 hover:bg-blue-50"><Pencil size={14} /></button>
                          <button type="button" onClick={() => toggle(a)} disabled={busyId === a.id || (!disabled && a.id === myId)}
                            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold disabled:opacity-40 ${disabled ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "border-red-200 text-red-600 hover:bg-red-50"}`}>
                            {disabled ? <CheckCircle2 size={13} /> : <Ban size={13} />} {disabled ? "تفعيل" : "تعطيل"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          الدور الإداري للتنظيم والتعريف — كل مديري المنصة يملكون صلاحياتها كاملة. آخر دخول يُسجَّل من الآن فصاعداً.
        </p>
      </div>

      {adding && (
        <AdminModal title="إضافة مدير جديد للمنصة" onClose={() => setAdding(false)}>
          <form onSubmit={addAdmin} className="space-y-4">
            <div className="space-y-1"><label className={label}>الاسم *</label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1"><label className={label}>البريد الإلكتروني *</label><Input type="email" dir="ltr" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1"><label className={label}>كلمة المرور *</label><Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="space-y-1"><label className={label}>الهاتف</label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1">
                <label className={label}>الدور الإداري</label>
                <SearchableSelect className={selectClass} value={form.adminRole} onChange={(e) => setForm({ ...form, adminRole: e.target.value })}>
                  {Object.entries(ADMIN_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </SearchableSelect>
              </div>
            </div>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">المدير الجديد يملك صلاحيات المنصة كاملة (كل المكاتب والاشتراكات والدعم).</p>
            <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#273c75] py-3 font-bold text-white hover:bg-[#192a56] disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />} إنشاء الحساب
            </button>
          </form>
        </AdminModal>
      )}

      {editing && (
        <AdminModal title="تعديل بيانات المدير" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-1"><label className={label}>الاسم</label><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="space-y-1"><label className={label}>الهاتف</label><Input dir="ltr" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            <div className="space-y-1">
              <label className={label}>الدور الإداري</label>
              <SearchableSelect className={selectClass} value={editing.adminRole || "OWNER"} onChange={(e) => setEditing({ ...editing, adminRole: e.target.value })}>
                {Object.entries(ADMIN_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </SearchableSelect>
            </div>
            <p className="text-xs text-slate-400">كلمة المرور يغيّرها المدير بنفسه من «الإعدادات»، والبريد الإلكتروني من لوحة Firebase Authentication.</p>
            <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#273c75] py-3 font-bold text-white hover:bg-[#192a56] disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" />} حفظ التعديلات
            </button>
          </form>
        </AdminModal>
      )}
    </div>
  );
}
