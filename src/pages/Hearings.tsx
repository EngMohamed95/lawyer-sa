import { useEffect, useState } from "react";
import { Plus, Search, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { AddHearingModal } from "../components/AddHearingModal";
import { Pagination } from "../components/ui/Pagination";
import { collection, getDocs, query, where, collectionGroup, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import HearingCard from "../components/HearingCard";
import { visibleCasesQuery } from "../lib/caseAccess";

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
        let casesQuery;
        if (userRole === "OFFICE_LAWYER") {
          const userId = localStorage.getItem("userId");
          casesQuery = visibleCasesQuery(lawyerId || "", limit(100));
        } else {
          casesQuery = query(collection(db, "cases"), where("lawyerId", "==", lawyerId), limit(100));
        }
        const casesSnap = await getDocs(casesQuery);
        const arrays = await Promise.all(
          casesSnap.docs.map(cd =>
            getDocs(collection(db, "cases", cd.id, "hearings")).then(s =>
              s.docs.map(d => ({ id: d.id, ...d.data(), caseId: cd.id }))
            )
          )
        );
        hearingsData = arrays.flat();
      }

      // الأحدث أولاً
      setHearings(
        hearingsData.sort((a, b) => new Date(b.hearingDate).getTime() - new Date(a.hearingDate).getTime())
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

  const filteredHearings = hearings.filter(
    h =>
      h.court?.toLowerCase().includes(search.toLowerCase()) ||
      h.caseTitle?.toLowerCase().includes(search.toLowerCase()) ||
      String(h.caseNumber || "").toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">الجلسات</h1>
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
          {loading ? (
            <div className="text-center py-10">جاري التحميل...</div>
          ) : filteredHearings.length === 0 ? (
            <div className="text-center py-10 text-gray-500">لا توجد جلسات مسجلة</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {pagedHearings.map(h => <HearingCard key={`${h.caseId}_${h.id}`} h={h} caseId={h.caseId} />)}
            </div>
          )}
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
