/**
 * تعديل بيانات عضو في فريق المكتب — الاسم والهاتف والدور فقط.
 *
 * لا يعدّل البريد الإلكتروني ولا كلمة المرور: هذان جزء من هوية الحساب في
 * Firebase Auth، وتغييرهما يحتاج صلاحيات Admin SDK غير متاحة في هذا الإعداد
 * (راجع ملاحظة server.ts عن غياب بيانات اعتماد Firebase Admin).
 */

import { useEffect, useState } from "react";
import { X, UserCog, AlertCircle, Check } from "lucide-react";
import { Button } from "./ui/button";
import { ROLES_CREATABLE_BY_OFFICE, ROLE_LABELS_AR, type Role } from "../lib/roles";
import { writeAudit } from "../lib/audit";

interface TeamMemberLike {
  id: string;
  name?: string;
  phone?: string;
  role?: string;
}

interface EditTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  member: TeamMemberLike | null;
}

export default function EditTeamMemberModal({ isOpen, onClose, onSuccess, member }: EditTeamMemberModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("OFFICE_LAWYER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (member) {
      setName(member.name ?? "");
      setPhone(member.phone ?? "");
      setRole((member.role as Role) ?? "OFFICE_LAWYER");
      setError("");
    }
  }, [member]);

  if (!isOpen || !member) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("الاسم مطلوب"); return; }

    setLoading(true);
    setError("");
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await import("../lib/firebase");

      await updateDoc(doc(db, "users", member.id), {
        name: name.trim(),
        phone: phone.trim(),
        role,
        updatedAt: new Date().toISOString(),
      });

      await writeAudit({
        action: "UPDATE",
        entity: "user",
        entityId: member.id,
        entityLabel: name.trim(),
        before: { الاسم: member.name || "—", الهاتف: member.phone || "—", الدور: ROLE_LABELS_AR[(member.role as Role) ?? "OFFICE_LAWYER"] },
        after: { الاسم: name.trim(), الهاتف: phone.trim() || "—", الدور: ROLE_LABELS_AR[role] },
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError("تعذّر حفظ التعديلات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#133B2E] text-white rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E]">
              <UserCog size={20} />
            </div>
            <h2 className="text-xl font-bold">تعديل بيانات العضو</h2>
          </div>
          <button onClick={onClose} className="p-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 block mr-1">الاسم الكامل</label>
            <input
              required type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 block mr-1">رقم الهاتف</label>
            <input
              type="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#133B2E]/10 focus:border-[#133B2E] transition-all"
              placeholder="05xxxxxxxx" dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-[#133B2E] block">الدور والصلاحيات</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLES_CREATABLE_BY_OFFICE.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`text-right p-3 rounded-2xl border-2 transition-all ${
                    role === r
                      ? "border-[#D4AF37] bg-[#D4AF37]/10 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-[#133B2E]">{ROLE_LABELS_AR[r]}</span>
                    {role === r && <Check size={16} className="text-[#D4AF37] shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90 active:scale-[0.98] transition-all">
              {loading ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}
              className="flex-1 py-6 border-gray-200 text-gray-500 rounded-2xl hover:bg-gray-50 transition-all">
              إلغاء
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
