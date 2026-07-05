import { useEffect, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  ChevronRight,
  Gavel,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { db } from "../lib/firebase";

type RecentCase = {
  id: string;
  title?: string;
  caseNumber?: string;
  status?: string;
  createdAt?: string;
};

type UpcomingHearing = {
  id: string;
  hearingDate: string;
  caseTitle?: string;
  court?: string;
  caseId?: string;
};

type DashboardStats = {
  totalClients: number;
  activeCases: number;
  upcomingHearingsCount: number;
  recentCases: RecentCase[];
  upcomingHearings: UpcomingHearing[];
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeCases: 0,
    upcomingHearingsCount: 0,
    recentCases: [],
    upcomingHearings: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userRole = localStorage.getItem("userRole");
  const lawyerId = localStorage.getItem("lawyerId");
  const userName = localStorage.getItem("userName") || "مستخدم";

  const today = new Date().toISOString().split("T")[0];
  const isToday = (d: string) => d === today;

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      setError(null);
      try {
        const isSuperAdmin = userRole === "SUPER_ADMIN";
        const shouldFilter = !isSuperAdmin && Boolean(lawyerId);

        const casesQ = shouldFilter
          ? query(collection(db, "cases"), where("lawyerId", "==", lawyerId))
          : collection(db, "cases");
        const clientsQ = shouldFilter
          ? query(collection(db, "clients"), where("lawyerId", "==", lawyerId))
          : collection(db, "clients");

        // Helper: fetch upcoming hearings with minimal reads
        const fetchUpcoming = async (): Promise<UpcomingHearing[]> => {
          if (isSuperAdmin) {
            // Try date-filtered query first (needs collectionGroup index); fall back to capped batch
            try {
              const snap = await getDocs(
                query(collectionGroup(db, "hearings"), where("hearingDate", ">=", today), orderBy("hearingDate"), limit(8))
              );
              return snap.docs.map(d => ({ id: d.id, ...(d.data() as any), caseId: d.ref.parent.parent?.id }));
            } catch {
              const snap = await getDocs(query(collectionGroup(db, "hearings"), limit(30)));
              return snap.docs
                .map(d => ({ id: d.id, ...(d.data() as any), caseId: d.ref.parent.parent?.id }))
                .filter(h => h.hearingDate >= today)
                .sort((a, b) => a.hearingDate.localeCompare(b.hearingDate))
                .slice(0, 8);
            }
          }
          // Lawyer: 5 cases × 3 upcoming hearings each (max 15 reads, down from 150+)
          const casesSnap = await getDocs(query(casesQ, limit(5)));
          const arrays = await Promise.all(
            casesSnap.docs.map(cd => {
              const ref = collection(db, "cases", cd.id, "hearings");
              return getDocs(query(ref, where("hearingDate", ">=", today), orderBy("hearingDate"), limit(3)))
                .then(s => s.docs.map(d => ({ id: d.id, ...(d.data() as any), caseId: cd.id })))
                .catch(() =>
                  getDocs(ref).then(s =>
                    s.docs.map(d => ({ id: d.id, ...(d.data() as any), caseId: cd.id }))
                      .filter(h => h.hearingDate >= today)
                  )
                );
            })
          );
          return arrays.flat()
            .sort((a, b) => a.hearingDate.localeCompare(b.hearingDate))
            .slice(0, 8);
        };

        // ── Run all three fetches in parallel ────────────────────────────────
        const [[casesCount, clientsCount], recentCases, upcomingHearings] = await Promise.all([
          Promise.all([
            getCountFromServer(casesQ).then(s => s.data().count).catch(() => 0),
            getCountFromServer(clientsQ).then(s => s.data().count).catch(() => 0),
          ]),
          getDocs(query(casesQ, orderBy("createdAt", "desc"), limit(5)))
            .then(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<RecentCase, "id">) })))
            .catch(() =>
              getDocs(query(casesQ, limit(5))).then(snap =>
                snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<RecentCase, "id">) }))
              )
            ),
          fetchUpcoming().catch(() => [] as UpcomingHearing[]),
        ]);

        setStats({
          totalClients: clientsCount,
          activeCases: casesCount,
          upcomingHearingsCount: upcomingHearings.length,
          recentCases,
          upcomingHearings,
        });
      } catch (err) {
        console.error(err);
        setError("حدث خطأ أثناء تحميل بيانات لوحة التحكم.");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [userRole, lawyerId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#0A192F] border-t-transparent" />
          <p className="font-medium text-gray-500">جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "إجمالي الموكلين", value: stats.totalClients, icon: <Users className="text-blue-600" />, color: "from-blue-50 to-white" },
    { title: "إجمالي القضايا", value: stats.activeCases, icon: <Briefcase className="text-purple-600" />, color: "from-purple-50 to-white" },
    { title: "الجلسات القادمة", value: stats.upcomingHearingsCount, icon: <Calendar className="text-amber-600" />, color: "from-amber-50 to-white" },
    { title: "آخر القضايا", value: stats.recentCases.length, icon: <TrendingUp className="text-green-600" />, color: "from-green-50 to-white" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[#0A192F]">أهلا بك، {userName}</h1>
          <p className="mt-2 text-lg text-gray-500">إليك ملخص سريع لأعمال المكتب اليوم.</p>
        </div>
        <Badge className="border-none bg-green-100 px-4 py-2 font-bold text-green-700">النظام يعمل</Badge>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-4 text-red-700">
            <AlertCircle size={20} />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map(item => (
          <Card key={item.title} className={`border-none bg-gradient-to-br ${item.color} shadow-md`}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="mb-1 text-sm font-bold text-gray-500">{item.title}</p>
                  <h3 className="text-3xl font-black text-[#0A192F]">{item.value}</h3>
                </div>
                <div className="rounded-2xl bg-white p-3 shadow-sm">{item.icon}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Recent Cases */}
        <Card className="overflow-hidden border-none bg-white shadow-xl lg:col-span-2">
          <CardHeader className="border-b bg-gray-50/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A192F] text-white">
                  <Briefcase size={20} />
                </div>
                <CardTitle className="text-xl font-bold">آخر القضايا المضافة</CardTitle>
              </div>
              <Link to="/app/cases">
                <Button variant="ghost" className="font-bold text-[#0A192F]">
                  عرض الكل <ChevronRight size={16} className="mr-1 rotate-180" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stats.recentCases.length === 0 ? (
                <div className="p-10 text-center text-gray-500">لا توجد قضايا مضافة مؤخراً</div>
              ) : (
                stats.recentCases.map(c => (
                  <Link key={c.id} to={`/app/cases/${c.id}`} className="block p-5 transition-colors hover:bg-gray-50">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-[#0A192F]">
                          <Gavel size={24} />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-[#0A192F]">{c.title || "قضية بدون عنوان"}</p>
                          <p className="text-sm text-gray-500">رقم القضية: {c.caseNumber || "---"}</p>
                        </div>
                      </div>
                      <Badge className={c.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                        {c.status === "OPEN" ? "نشطة" : "مغلقة"}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Hearings */}
        <Card className="overflow-hidden border-none bg-white shadow-xl">
          <CardHeader className="border-b bg-gray-50/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37] text-white">
                  <Calendar size={20} />
                </div>
                <CardTitle className="text-xl font-bold">الجلسات القادمة</CardTitle>
              </div>
              <Link to="/app/hearings">
                <Button variant="ghost" className="font-bold text-[#0A192F]">
                  عرض الكل <ChevronRight size={16} className="mr-1 rotate-180" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {stats.upcomingHearings.length === 0 ? (
                <div className="p-10 text-center text-gray-500">لا توجد جلسات قادمة</div>
              ) : (
                stats.upcomingHearings.map(h => (
                  <Link
                    key={h.id}
                    to={h.caseId ? `/app/cases/${h.caseId}` : "/app/hearings"}
                    className={`block p-4 transition-colors hover:bg-gray-50 ${isToday(h.hearingDate) ? "bg-amber-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#0A192F]">{h.caseTitle || "—"}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{h.court || "—"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-bold text-gray-700">
                          {new Date(h.hearingDate).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                        </span>
                        {isToday(h.hearingDate) && (
                          <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">اليوم</Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
