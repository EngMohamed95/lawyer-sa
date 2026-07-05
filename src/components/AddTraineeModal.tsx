import { useState } from "react";
import { X, UserPlus, Mail, Phone, Lock, Shield } from "lucide-react";
import { Button } from "./ui/button";

interface AddTraineeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddTraineeModal({ isOpen, onClose, onSuccess }: AddTraineeModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { setDoc, doc } = await import("firebase/firestore");
      const { db, firebaseConfig } = await import("../lib/firebase");
      const { initializeApp, deleteApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword } = await import("firebase/auth");
      
      const lawyerId = localStorage.getItem("lawyerId");
      
      // 1. Create the user in Firebase Auth using a secondary app instance
      // This prevents the current lawyer from being logged out when a new user is created
      const secondaryApp = initializeApp(firebaseConfig, "TraineeCreationApp_" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
      const uid = userCredential.user.uid;

      // 2. Save trainee profile to Firestore using the Auth UID
      await setDoc(doc(db, "users", uid), {
        ...formData,
        role: "TRAINEE",
        lawyerId,
        createdAt: new Date().toISOString()
      });
      
      // 3. Cleanup secondary app
      await deleteApp(secondaryApp);
      
      onSuccess();
      onClose();
      alert("تم إضافة المتدرب بنجاح وإنشاء حساب تسجيل الدخول له.");
    } catch (error: any) {
      console.error(error);
      alert("حدث خطأ أثناء الإضافة: " + (error.code === 'auth/email-already-in-use' ? "البريد الإلكتروني مسجل مسبقاً" : error.message));
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
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">إضافة متدرب جديد</h2>
              <p className="text-xs text-[#D4AF37]">إنشاء حساب بصلاحيات محدودة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 block mr-1">الاسم الكامل</label>
            <div className="relative group">
              <input
                required
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10 focus:border-[#0A192F] transition-all"
                placeholder="أدخل اسم المتدرب"
              />
            </div>
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
                  placeholder="trainee@example.com"
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
                  placeholder="01xxxxxxxxx"
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
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pr-12 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0A192F]/10 focus:border-[#0A192F] transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-start gap-3">
            <Shield className="text-amber-600 mt-1" size={18} />
            <p className="text-xs text-amber-800 leading-relaxed">
              سيتم منح هذا المستخدم صلاحية **متدرب**. لن يتمكن من الوصول إلى البيانات المالية أو أتعاب الموكلين، وسيكون له حق الاطلاع فقط على القضايا والجلسات المسندة إليه.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 py-6 bg-[#0A192F] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#0A192F]/90 active:scale-[0.98] transition-all"
            >
              {loading ? "جاري الإضافة..." : "تأكيد الإضافة"}
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
