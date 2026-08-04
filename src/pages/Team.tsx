/**
 * فريق المكتب — كل مستخدمي المكتب بكل الأدوار في مكان واحد.
 *
 * صفحتا /app/office-lawyers و /app/trainees تبقيان كما هما ولم تُمَسّا؛
 * هذه الصفحة إضافة تجمعهما وتضيف الأدوار الخمسة الجديدة.
 */

import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Search, Phone as PhoneIcon, Mail, ShieldAlert } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { Query, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import AddTeamMemberModal from "../components/AddTeamMemberModal";
import RoleBadge from "../components/RoleBadge";
import { usePermissions } from "../lib/usePermissions";
import { ROLES_CREATABLE_BY_OFFICE, ROLE_LABELS_AR, normalizeRole, type Role } from "../lib/roles";

interface TeamMember {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  createdAt?: string;
  deletedAt?: string | null;
}

export default function Team() {
  const perms = usePermissions();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const canManage = perms.can("users.manage");

  const fetchTeam = async () => {
    setLoading(true);
    setError("");
    try {
      const lawyerId = perms.lawyerId;
      if (!lawyerId || lawyerId === "ALL") {
        setMembers([]);
        return;
      }

      const q: Query<DocumentData> = query(
        collection(db, "users"),
        where("lawyerId", "==", lawyerId)
      );
      const snap = await getDocs(q);
      const data: TeamMember[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<TeamMember, "id">) }))
        // الحذف الناعم: نتجاهل المحذوفين (المستندات القديمة بلا الحقل تُعتبر نشطة)
        .filter((m) => !m.deletedAt);

      setMembers(data);
    } catch (err) {
      console.error("Error fetching team:", err);
      setError("تعذّر تحميل فريق المكتب. تأكد من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) void fetchTeam();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perms.lawyerId, canManage]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      const r = normalizeRole(m.role);
      map.set(r, (map.get(r) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((m) => {
      const matchesRole = roleFilter === "ALL" || normalizeRole(m.role) === roleFilter;
      const matchesTerm =
        !term ||
        (m.name ?? "").toLowerCase().includes(term) ||
        (m.email ?? "").toLowerCase().includes(term) ||
        (m.phone ?? "").includes(term);
      return matchesRole && matchesTerm;
    });
  }, [members, roleFilter, search]);

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center" dir="rtl">
        <div className="w-14 h-14 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
          <ShieldAlert size={26} />
        </div>
        <h2 className="text-xl font-bold text-[#133B2E]">لا تملك صلاحية إدارة المستخدمين</h2>
        <p className="text-sm text-gray-500">هذه الصفحة متاحة لمدير المكتب فقط.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AddTeamMemberModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={fetchTeam}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">فريق المكتب</h1>
          <p className="text-gray-500 mt-1 text-sm">
            إدارة كل مستخدمي المكتب وأدوارهم — {members.length} عضو
          </p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg shadow-[#133B2E]/20"
        >
          <Plus className="ml-2 h-4 w-4" /> إضافة عضو
        </Button>
      </div>

      {/* بطاقات العدّ لكل دور */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {ROLES_CREATABLE_BY_OFFICE.map((r) => (
          <button
            key={r}
            onClick={() => setRoleFilter(roleFilter === r ? "ALL" : r)}
            className={`p-3 rounded-2xl border text-right transition-all ${
              roleFilter === r
                ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-sm"
                : "border-gray-100 bg-white hover:border-gray-200"
            }`}
          >
            <p className="text-2xl font-black text-[#133B2E]">{counts.get(r) ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">{ROLE_LABELS_AR[r]}</p>
          </button>
        ))}
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-bold text-lg text-[#133B2E]">
              {roleFilter === "ALL" ? "كل الأعضاء" : ROLE_LABELS_AR[roleFilter]}
              <span className="text-sm font-normal text-gray-400 mr-2">({filtered.length})</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {roleFilter !== "ALL" && (
              <button onClick={() => setRoleFilter("ALL")} className="text-xs text-[#D4AF37] hover:underline">
                إلغاء التصفية
              </button>
            )}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو البريد..."
                className="pr-9 pl-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:border-[#133B2E] w-full sm:w-56 bg-white"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {error ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-red-600 text-sm">{error}</p>
              <Button variant="outline" onClick={fetchTeam} className="rounded-xl">إعادة المحاولة</Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-white">
                <TableRow>
                  <TableHead className="text-right font-bold text-[#133B2E]">الاسم</TableHead>
                  <TableHead className="text-right font-bold text-[#133B2E]">الدور</TableHead>
                  <TableHead className="text-right font-bold text-[#133B2E] hidden md:table-cell">البريد الإلكتروني</TableHead>
                  <TableHead className="text-right font-bold text-[#133B2E] hidden sm:table-cell">الهاتف</TableHead>
                  <TableHead className="text-right font-bold text-[#133B2E] hidden lg:table-cell">تاريخ الإضافة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-gray-500">جاري التحميل...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Users size={32} className="text-gray-300" />
                        <p className="font-medium text-gray-500">
                          {members.length === 0 ? "لا يوجد أعضاء في فريق المكتب بعد" : "لا نتائج مطابقة"}
                        </p>
                        {members.length === 0 && (
                          <p className="text-xs">اضغط «إضافة عضو» لإنشاء أول حساب</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m) => (
                    <TableRow key={m.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-medium text-[#133B2E]">{m.name || "—"}</TableCell>
                      <TableCell><RoleBadge role={m.role} /></TableCell>
                      <TableCell className="text-gray-600 hidden md:table-cell">
                        {m.email ? (
                          <a href={`mailto:${m.email}`} className="flex items-center gap-2 hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4" dir="ltr">
                            <Mail size={14} className="text-gray-400 shrink-0" />
                            {m.email}
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {m.phone ? (
                          <a href={`tel:${m.phone}`} className="flex items-center gap-2 text-[#133B2E] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4" dir="ltr">
                            <PhoneIcon size={14} className="text-gray-400 shrink-0" />
                            {m.phone}
                          </a>
                        ) : "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-right text-gray-500 text-sm hidden lg:table-cell">
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString("ar-EG") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
