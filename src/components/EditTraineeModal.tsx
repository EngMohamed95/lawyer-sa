import { useState, useEffect } from "react";
import { X, UserEdit, Mail, Phone, Lock, Save } from "lucide-react";
import { Button } from "./ui/button";

interface EditTraineeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  traineeData: any;
}

export default function EditTraineeModal({ isOpen, onClose, onSuccess, traineeData }: EditTraineeModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (traineeData) {
      setFormData({
        name: traineeData.name || "",
        email: traineeData.email || "",
        phone: traineeData.phone || "",
        password: traineeData.password || "",
      });
    }
  }, [traineeData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");
      
      const traineeRef = doc(db, "users", traineeData.id);
      await updateDoc(traineeRef, {
        ...formData,
        updatedAt: new Date().toISOString()
      });
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء التحديث: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#0A192F] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#0A192F]">
              <X size={20} className="hidden" />
              <Mail size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">تعديل بيانات المتدرب</h2>
              <p className="text-xs text-[#D4AF37]">تحديث المعلومات الأساسية وكلمة المرور</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 block mr-1">الاسم الكامل</label>
            <input
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10 focus:border-[#0A192F] transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 block mr-1">البريد الإلكتروني</label>
              <div className="relative group">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  required
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10 focus:border-[#0A192F] transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 block mr-1">رقم الهاتف</label>
              <div className="relative group">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  required
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10 focus:border-[#0A192F] transition-all"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 block mr-1">كلمة المرور</label>
            <div className="relative group">
              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                required
                type="text"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10 focus:border-[#0A192F] transition-all"
                placeholder="••••••••"
              />
            </div>
            <p className="text-[10px] text-amber-600 mr-2">* تغيير كلمة المرور هنا للتذكير فقط، يجب تحديثها في نظام التأمين إذا لزم الأمر.</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 py-6 bg-[#0A192F] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#0A192F]/90 active:scale-[0.98] transition-all"
            >
              <Save size={18} className="ml-2" />
              {loading ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 py-6 border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50 transition-all"
            >
              إلغاء
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
