import { useEffect, useState } from "react";
import { Plus, Shield, Phone as PhoneIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import AddConsultantModal from "../components/AddConsultantModal";
import EditConsultantModal from "../components/EditConsultantModal";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { Query, DocumentData } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Consultants() {
  const [consultants, setConsultants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingConsultant, setEditingConsultant] = useState<any>(null);

  const lawyerId = localStorage.getItem("lawyerId");
  const userRole = localStorage.getItem("userRole");

  const fetchConsultants = async () => {
    setLoading(true);
    try {
      let q: Query<DocumentData>;
      if (userRole === "SUPER_ADMIN") {
        q = query(collection(db, "users"), where("role", "==", "CONSULTANT"));
      } else if (lawyerId) {
        q = query(collection(db, "users"), where("role", "==", "CONSULTANT"), where("lawyerId", "==", lawyerId));
      } else {
        setConsultants([]);
        setLoading(false);
        return;
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setConsultants(data);
    } catch (error) {
      console.error("Error fetching consultants:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultants();
  }, [lawyerId, userRole]);

  return (
    <div className="space-y-6 font-['Tajawal']" dir="rtl">
      <AddConsultantModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchConsultants}
      />

      {editingConsultant && (
        <EditConsultantModal
          isOpen={!!editingConsultant}
          onClose={() => setEditingConsultant(null)}
          onSuccess={fetchConsultants}
          consultantData={editingConsultant}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#133B2E] tracking-tight">المستشارون</h1>
          <p className="text-gray-500 mt-1">إدارة المستشارين القانونيين بالمكتب وتعيين صلاحياتهم</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white shadow-lg shadow-[#133B2E]/20"
          >
            <Plus className="ml-2 h-4 w-4" /> إضافة مستشار
          </Button>
        </div>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardHeader className="border-b bg-gray-50/50 py-4 flex flex-row items-center gap-2">
          <Shield className="w-5 h-5 text-[#D4AF37]" />
          <h2 className="font-bold text-lg text-[#133B2E]">قائمة المستشارين المسجلين</h2>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-white">
              <TableRow>
                <TableHead className="text-right font-bold text-[#133B2E]">الاسم</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">البريد الإلكتروني</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E]">رقم الهاتف</TableHead>
                <TableHead className="text-right font-bold text-[#133B2E] hidden sm:table-cell">تاريخ التسجيل</TableHead>
                <TableHead className="text-center font-bold text-[#133B2E]">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10">جاري التحميل...</TableCell></TableRow>
              ) : consultants.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-gray-500">لا يوجد مستشارون مسجلون بالمكتب حالياً</TableCell></TableRow>
              ) : (
                consultants.map((c: any) => (
                  <TableRow key={c.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-[#133B2E]">{c.name}</TableCell>
                    <TableCell className="text-gray-600">{c.email}</TableCell>
                    <TableCell>
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-[#133B2E] hover:underline decoration-[#D4AF37] decoration-2 underline-offset-4">
                          <PhoneIcon size={14} className="text-gray-400" />
                          {c.phone}
                        </a>
                      ) : "-"}
                    </TableCell>
                    <TableCell dir="ltr" className="text-right hidden sm:table-cell">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-EG') : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800" onClick={() => setEditingConsultant(c)}>التفاصيل والتعديل</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
