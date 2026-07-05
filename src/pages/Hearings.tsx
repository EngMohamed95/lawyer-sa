import { useEffect, useState } from "react";
import { Plus, Search, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { AddHearingModal } from "../components/AddHearingModal";
import { Pagination } from "../components/ui/Pagination";
import { collection, getDocs, query, where, collectionGroup, limit } from "firebase/firestore";
import { db } from "../lib/firebase";

const PAGE_SIZE = 20;

export default function Hearings() {
  const [hearings, setHearings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const lawyerId = localStorage.getItem("lawyerId");
  const userRole = localStorage.getItem("userRole");

  const fetchHearings = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!lawyerId && userRole !== "SUPER_ADMIN") {
        setHearings([]);
        return;
      }

      let hearingsData: any[] = [];

      if (userRole === "SUPER_ADMIN") {
        const snap = await getDocs(collectionGroup(db, "hearings"));
        hearingsData = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          caseId: doc.data().caseId || doc.ref.parent.parent?.id,
        }));
      } else {
        // Fetch cases (capped at 100), then their hearings in parallel
        const casesSnap = await getDocs(
          query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(100))
        );
        const arrays = await Promise.all(
          casesSnap.docs.map(cd =>
            getDocs(collection(db, "cases", cd.id, "hearings")).then(s =>
              s.docs.map(d => ({ id: d.id, ...d.data(), caseId: cd.id }))
            )
          )
        );
        hearingsData = arrays.flat();
      }

      setHearings(
        hearingsData.sort((a, b) => new Date(a.hearingDate).getTime() - new Date(b.hearingDate).getTime())
      );
      setPage(1);
    } catch (err: any) {
      console.error("Error fetching hearings:", err);
      setError("حدث خطأ أثناء جلب الجلسات: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHearings();
  }, [lawyerId, userRole]);

  const today = new Date().toISOString().split("T")[0];
  const isToday = (d: string) => d === today;
  const isPast = (d: string) => d < today;

  const filteredHearings = hearings.filter(
    h =>
      h.court?.toLowerCase().includes(search.toLowerCase()) ||
      h.caseTitle?.toLowerCase().includes(search.toLowerCase())
  );

  const pagedHearings = filteredHearings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <AddHearingModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchHearings}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">الجلسات</h1>
          <p className="text-gray-500 mt-1">جدول الجلسات والمواعيد القادمة</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-gray-300">
            <Download className="ml-2 h-4 w-4" /> تحميل رول الجلسات
          </Button>
          <Button className="bg-[#D4AF37] hover:bg-[#B8962E] text-white" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> إضافة جلسة
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-red-700 flex items-center gap-3">
            <Search className="h-5 w-5" />
            <p className="font-bold">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 pb-4">
          <div className="flex items-center space-x-2 space-x-reverse relative w-full sm:w-96">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="بحث برقم القضية أو المحكمة..."
              className="pl-4 pr-10 bg-white"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
            <Button variant="outline" size="icon" className="mr-2">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-right font-bold text-[#0A192F]">تاريخ الجلسة</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">القضية</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">المحكمة</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F] hidden md:table-cell">طلبات الجلسة</TableHead>
                <TableHead className="text-right font-bold text-[#0A192F]">الحالة</TableHead>
                {userRole === "SUPER_ADMIN" && (
                  <TableHead className="text-right font-bold text-purple-600 hidden lg:table-cell">المحامي</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 6 : 5} className="text-center py-10">
                    جاري التحميل...
                  </TableCell>
                </TableRow>
              ) : filteredHearings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={userRole === "SUPER_ADMIN" ? 6 : 5} className="text-center py-10 text-gray-500">
                    لا توجد جلسات مسجلة
                  </TableCell>
                </TableRow>
              ) : (
                pagedHearings.map(h => (
                  <TableRow
                    key={h.id}
                    className={isToday(h.hearingDate) ? "bg-amber-50" : isPast(h.hearingDate) ? "opacity-60" : ""}
                  >
                    <TableCell className="font-bold">
                      <div className="flex items-center gap-2">
                        {new Date(h.hearingDate).toLocaleDateString("ar-EG", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                        {isToday(h.hearingDate) && <Badge className="bg-amber-500 text-white">اليوم</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-blue-600 font-medium">{h.caseTitle || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{h.court || "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-xs truncate hidden md:table-cell">
                      {h.requiredActions || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isToday(h.hearingDate) ? "border-amber-500 text-amber-700"
                          : isPast(h.hearingDate) ? "border-gray-300 text-gray-500"
                          : "text-green-600 border-green-200"
                        }
                      >
                        {isToday(h.hearingDate) ? "اليوم" : isPast(h.hearingDate) ? "منتهية" : "قادمة"}
                      </Badge>
                    </TableCell>
                    {userRole === "SUPER_ADMIN" && (
                      <TableCell className="text-xs text-purple-600 hidden lg:table-cell">
                        {h.lawyerId || "غير محدد"}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Pagination
            currentPage={page}
            totalItems={filteredHearings.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
