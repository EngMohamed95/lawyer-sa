import { useEffect, useState } from "react";
import { GraduationCap, UserCheck, Search, Plus, Star, Award, Phone as PhoneIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import AddTraineeModal from "../components/AddTraineeModal";
import EditTraineeModal from "../components/EditTraineeModal";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Trainees() {
  const [data, setData] = useState<any>({ trainees: [], evaluations: [] });
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTrainee, setEditingTrainee] = useState<any>(null);

  const lawyerId = localStorage.getItem("lawyerId");
  const userRole = localStorage.getItem("userRole");

  const fetchTrainees = async () => {
    setLoading(true);
    try {
      // SaaS Filtering: Only show trainees belonging to this specific lawyer
      let q;
      if (userRole === "SUPER_ADMIN") {
        q = query(collection(db, "users"), where("role", "==", "TRAINEE"));
      } else if (lawyerId) {
        q = query(collection(db, "users"), where("role", "==", "TRAINEE"), where("lawyerId", "==", lawyerId));
      } else {
        // Fallback if lawyerId is missing: show nothing for safety
        setData({ trainees: [], evaluations: [] });
        setLoading(false);
        return;
      }

      const snap = await getDocs(q);
      const trainees = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setData({ trainees, evaluations: [] });
    } catch (error) {
      console.error("Error fetching trainees:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainees();
  }, [lawyerId, userRole]);

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AddTraineeModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSuccess={fetchTrainees} 
      />
      
      {editingTrainee && (
        <EditTraineeModal
          isOpen={!!editingTrainee}
          onClose={() => setEditingTrainee(null)}
          onSuccess={fetchTrainees}
          traineeData={editingTrainee}
        />
      )}
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0A192F] tracking-tight">المتدربين</h1>
          <p className="text-gray-500 mt-1">إدارة المحامين تحت التدريب وتقييم الأداء</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-white">
            <Star className="ml-2 h-4 w-4 text-[#D4AF37]" /> إضافة تقييم
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white shadow-lg shadow-[#0A192F]/20"
          >
            <Plus className="ml-2 h-4 w-4" /> إضافة متدرب
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-gray-200">
        <Tabs defaultValue="list" className="w-full">
          <CardHeader className="border-b bg-gray-50/50 pb-0 pt-4">
            <TabsList className="bg-transparent border-b-0 space-x-4 space-x-reverse h-auto p-0 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-hide">
              <TabsTrigger value="list" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#D4AF37] px-6 py-3 font-semibold rounded-none">
                <GraduationCap className="w-4 h-4 ml-2" /> قائمة المتدربين
              </TabsTrigger>
              <TabsTrigger value="evaluations" className="data-[state=active]:bg-white data-[state=active]:border-t-2 data-[state=active]:border-[#D4AF37] px-6 py-3 font-semibold rounded-none">
                <Award className="w-4 h-4 ml-2" /> سجل التقييمات
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <TabsContent value="list" className="m-0 border-none p-0">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow>
                    <TableHead className="text-right font-bold text-[#0A192F]">الاسم</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">رقم الهاتف</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F] hidden sm:table-cell">تاريخ الالتحاق</TableHead>
                    {userRole === "SUPER_ADMIN" && <TableHead className="text-right font-bold text-purple-600 hidden md:table-cell">المحامي</TableHead>}
                    <TableHead className="text-right font-bold text-[#0A192F] hidden lg:table-cell">المشرف</TableHead>
                    <TableHead className="text-center font-bold text-[#0A192F]">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={userRole === "SUPER_ADMIN" ? 6 : 5} className="text-center py-10">جاري التحميل...</TableCell></TableRow>
                  ) : !Array.isArray(data?.trainees) || data.trainees.length === 0 ? (
                    <TableRow><TableCell colSpan={userRole === "SUPER_ADMIN" ? 6 : 5} className="text-center py-10 text-gray-500">لا يوجد متدربين مسجلين</TableCell></TableRow>
                  ) : (
                    data.trainees.map((t: any) => (
                      <TableRow key={t.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-medium text-[#0A192F]">{t.name}</TableCell>
                        <TableCell>
                          <a href={`tel:${t.phone}`} className="flex items-center gap-2 text-[#0A192F] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4">
                            <PhoneIcon size={14} className="text-gray-400" />
                            {t.phone || "-"}
                          </a>
                        </TableCell>
                        <TableCell dir="ltr" className="text-right hidden sm:table-cell">{t.createdAt ? new Date(t.createdAt).toLocaleDateString('ar-EG') : "-"}</TableCell>
                        {userRole === "SUPER_ADMIN" && <TableCell className="text-xs text-purple-600 hidden md:table-cell">{t.lawyerId || "غير محدد"}</TableCell>}
                        <TableCell className="hidden lg:table-cell">{t.supervisorName || "بدون مشرف"}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800" onClick={() => setEditingTrainee(t)}>التفاصيل والتعديل</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            
            <TabsContent value="evaluations" className="m-0 border-none p-0">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow>
                    <TableHead className="text-right font-bold text-[#0A192F]">تاريخ التقييم</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">المتدرب</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">التقييم (من 5)</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">المقيّم (المشرف)</TableHead>
                    <TableHead className="text-right font-bold text-[#0A192F]">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-gray-500">لا يوجد تقييمات مسجلة</TableCell></TableRow>
                </TableBody>
              </Table>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
