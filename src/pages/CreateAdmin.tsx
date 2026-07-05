import { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export default function CreateAdmin() {
  const [email, setEmail] = useState("admin@lawyeros.com");
  const [password, setPassword] = useState("LawyerOS_SuperAdmin_2026!#");
  const [name, setName] = useState("المدير العام");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Create user document in Firestore users collection
      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        role: "SUPER_ADMIN",
        lawyerId: "ALL",
        createdAt: new Date().toISOString(),
        status: "ACTIVE"
      });

      setMessage("✅ تم إنشاء حساب المدير العام بنجاح! يمكنك الآن تسجيل الدخول.");
    } catch (err: any) {
      console.error(err);
      setError("❌ حدث خطأ: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0A192F] text-white flex items-center justify-center p-6 font-['Tajawal']">
      <div className="bg-white text-gray-900 p-8 rounded-2xl max-w-md w-full shadow-2xl">
        <h1 className="text-2xl font-bold text-center text-[#0A192F] mb-6">إنشاء حساب المدير العام (Super Admin)</h1>
        
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-3 border rounded-xl"
              required 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">كلمة المرور</label>
            <input 
              type="text" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-3 border rounded-xl"
              required 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">الاسم بالكامل</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full p-3 border rounded-xl"
              required 
            />
          </div>

          {message && <p className="text-green-600 font-semibold text-sm">{message}</p>}
          {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#D4AF37] text-white p-3 rounded-xl font-bold hover:bg-[#D4AF37]/90 transition-colors"
          >
            {loading ? "جاري الإنشاء..." : "إنشاء الحساب"}
          </button>
        </form>
      </div>
    </div>
  );
}
