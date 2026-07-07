import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";

export function EditClientModal({ isOpen, onClose, onSuccess, clientData }: { isOpen: boolean, onClose: () => void, onSuccess: () => void, clientData: any }) {
  const [loading, setLoading] = useState(false);
  const currencyCode = localStorage.getItem("sys_currency") || "SAR";
  const currencySymbol = currencyCode === "SAR" ? "ر.س" : currencyCode === "EGP" ? "ج.م" : "$";
  const [formData, setFormData] = useState({
    fullName: "",
    clientType: "INDIVIDUAL",
    phone: "",
    nationalId: "",
    address: "",
    totalFees: 0,
  });

  useEffect(() => {
    if (clientData) {
      setFormData({
        fullName: clientData.fullName || "",
        clientType: clientData.clientType || "INDIVIDUAL",
        phone: clientData.phone || "",
        nationalId: clientData.nationalId || "",
        address: clientData.address || "",
        totalFees: clientData.totalFees || 0,
      });
    }
  }, [clientData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const clientRef = doc(db, "clients", clientData.id);
      await updateDoc(clientRef, {
        ...formData,
        updatedAt: new Date().toISOString()
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء التعديل: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#0A192F]">تعديل بيانات الموكل</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">الاسم الكامل *</label>
              <Input 
                required
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                placeholder="اسم الموكل رباعي" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">النوع</label>
              <select 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.clientType}
                onChange={e => setFormData({...formData, clientType: e.target.value})}
              >
                <option value="INDIVIDUAL">فرد</option>
                <option value="COMPANY">شركة</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">رقم الهاتف *</label>
              <Input 
                required
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                placeholder="مثال: 010xxxxxxxx" 
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">{formData.clientType === "COMPANY" ? "الرقم الضريبي" : "رقم الهوية"}</label>
              <Input 
                value={formData.nationalId}
                onChange={e => setFormData({...formData, nationalId: e.target.value})}
                placeholder="" 
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-[#0A192F]">أتعاب متوقعة ({currencySymbol})</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.totalFees}
                onChange={e => setFormData({...formData, totalFees: Number(e.target.value)})}
                placeholder="مثال: 10000"
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-bold text-[#0A192F]">العنوان</label>
              <Input 
                value={formData.address}
                onChange={e => setFormData({...formData, address: e.target.value})}
                placeholder="العنوان التفصيلي" 
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={loading} className="bg-[#0A192F] hover:bg-[#0A192F]/90 text-white">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
