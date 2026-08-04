/**
 * صلاحيات المستند — التصنيف والمشاركة والأرشفة (الوثيقة §1.7 و§5).
 * كل تغيير يُسجَّل في سجل التدقيق.
 */

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { X, ShieldCheck, AlertTriangle, Save, Archive, ArchiveRestore, Users } from "lucide-react";
import { db } from "../lib/firebase";
import { Button } from "./ui/button";
import { usePermissions } from "../lib/usePermissions";
import { writeAudit } from "../lib/audit";
import { ROLES_CREATABLE_BY_OFFICE, roleLabel, type Role } from "../lib/roles";
import {
  CONFIDENTIALITY_COLORS, CONFIDENTIALITY_LABELS_AR, CONFIDENTIALITY_SHORT_AR,
  assignableConfidentialities, canManageDocument, confidentialityOf, isArchived,
  type Confidentiality, type VaultDocument,
} from "../lib/documentAcl";

interface Props {
  /** المستند وموقعه: ["cases", caseId, "documents", docId] */
  document: VaultDocument;
  path: string[];
  onClose: () => void;
  onDone: () => void;
}

export default function DocumentPermissionsModal({ document: d, path, onClose, onDone }: Props) {
  const perms = usePermissions();
  const canManage = canManageDocument(perms.role);
  const options = assignableConfidentialities(perms.role);

  const [level, setLevel] = useState<Confidentiality>(confidentialityOf(d));
  const [roles, setRoles] = useState<Role[]>(d.allowedRoles ?? []);
  const [shared, setShared] = useState<boolean>(d.sharedWithClient === true);
  const [tags, setTags] = useState((d.tags ?? []).join("، "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const archived = isArchived(d);

  const toggleRole = (r: Role) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const save = async () => {
    if (!canManage) { setErr("لا تملك صلاحية تعديل إعدادات المستند."); return; }
    setBusy(true);
    setErr("");
    try {
      const now = new Date().toISOString();
      const cleanTags = tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean).slice(0, 20);
      const before = {
        التصنيف: CONFIDENTIALITY_SHORT_AR[confidentialityOf(d)],
        "مشارَك مع العميل": d.sharedWithClient === true ? "نعم" : "لا",
        "أدوار مصرَّح لها": (d.allowedRoles ?? []).length,
      };

      await updateDoc(doc(db, path[0], ...path.slice(1)), {
        confidentiality: level,
        allowedRoles: roles,
        allowedUserIds: d.allowedUserIds ?? [],
        sharedWithClient: shared,
        sharedAt: shared ? (d.sharedAt ?? now) : null,
        sharedBy: shared ? (d.sharedBy ?? perms.userId) : null,
        tags: cleanTags,
        updatedAt: now,
      });

      await writeAudit({
        action: "UPDATE", entity: "document", entityId: d.id,
        entityLabel: d.name ?? "مستند",
        before,
        after: {
          التصنيف: CONFIDENTIALITY_SHORT_AR[level],
          "مشارَك مع العميل": shared ? "نعم" : "لا",
          "أدوار مصرَّح لها": roles.length,
        },
      });

      onDone();
    } catch (e) {
      console.error(e);
      setErr("تعذّر حفظ الإعدادات. تحقق من الاتصال ثم أعد المحاولة.");
    } finally { setBusy(false); }
  };

  const toggleArchive = async () => {
    if (!canManage) { setErr("لا تملك صلاحية الأرشفة."); return; }
    const reason = archived ? null : prompt("سبب الأرشفة (اختياري):");
    if (!archived && reason === null) return;
    setBusy(true);
    setErr("");
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, path[0], ...path.slice(1)),
        archived
          ? { status: "ACTIVE", archivedAt: null, archivedBy: null, archiveReason: null, updatedAt: now }
          : { status: "ARCHIVED", archivedAt: now, archivedBy: perms.userId, archiveReason: reason || null, updatedAt: now });

      await writeAudit({
        action: "UPDATE", entity: "document", entityId: d.id,
        entityLabel: d.name ?? "مستند",
        before: { الحالة: archived ? "مؤرشف" : "نشط" },
        after: { الحالة: archived ? "نشط" : "مؤرشف", السبب: reason || "—" },
      });
      onDone();
    } catch (e) {
      console.error(e);
      setErr("تعذّر تغيير حالة الأرشفة.");
    } finally { setBusy(false); }
  };

  const field = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-[#133B2E] text-sm";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b bg-[#133B2E] text-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-[#133B2E] shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">صلاحيات المستند</h2>
              <p className="text-xs text-[#D4AF37] truncate">{d.name || "مستند"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full shrink-0"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-5">
          {err && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{err}</span>
            </div>
          )}

          {!canManage && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
              للعرض فقط — لا تملك صلاحية تعديل إعدادات المستندات.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">التصنيف</label>
            <div className="space-y-1.5">
              {(["PUBLIC_INTERNAL", "RESTRICTED", "CONFIDENTIAL", "SECRET"] as Confidentiality[]).map((c) => {
                const allowed = options.includes(c);
                return (
                  <label key={c}
                    className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                      level === c ? CONFIDENTIALITY_COLORS[c] + " ring-2 ring-offset-1 ring-[#133B2E]/20" : "bg-white border-gray-200 hover:bg-gray-50"
                    } ${!allowed || !canManage ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <input type="radio" name="conf" checked={level === c} disabled={!allowed || !canManage}
                      onChange={() => setLevel(c)} className="w-4 h-4 accent-[#133B2E]" />
                    <span className="text-sm font-bold">{CONFIDENTIALITY_LABELS_AR[c]}</span>
                  </label>
                );
              })}
            </div>
            {options.length < 4 && (
              <p className="text-xs text-gray-400">التصنيفات الأعلى من صلاحية دورك غير متاحة لك.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-1">
              <Users size={15} /> أدوار مصرَّح لها استثناءً
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES_CREATABLE_BY_OFFICE.map((r) => (
                <button key={r} type="button" disabled={!canManage} onClick={() => toggleRole(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                    roles.includes(r) ? "bg-[#133B2E] text-[#D4AF37] border-[#133B2E]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  } ${!canManage ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {roleLabel(r)}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              الأدوار المختارة ترى المستند حتى لو كان تصنيفه أعلى من صلاحيتها الافتراضية.
            </p>
          </div>

          <div className={`p-4 rounded-2xl border ${shared ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100"}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={shared} disabled={!canManage}
                onChange={(e) => setShared(e.target.checked)} className="w-5 h-5 accent-[#133B2E] mt-0.5" />
              <span>
                <span className="block text-sm font-bold text-[#133B2E]">مشاركة مع العميل</span>
                <span className="block text-xs text-gray-600 mt-0.5">
                  العميل لا يرى إلا المستندات المفعّل لها هذا الخيار — بصرف النظر عن التصنيف.
                </span>
              </span>
            </label>
            {shared && level !== "PUBLIC_INTERNAL" && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2 mt-3">
                تنبيه: تشارك مستنداً مصنّفاً «{CONFIDENTIALITY_SHORT_AR[level]}» مع العميل — تأكّد أن ذلك مقصود.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">الوسوم</label>
            <input value={tags} disabled={!canManage} className={field}
              placeholder="مثال: توكيل، مرافعة، أصل"
              onChange={(e) => setTags(e.target.value)} />
            <p className="text-xs text-gray-400">تفصل بينها بفاصلة — تُستخدم في البحث.</p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t">
            <Button onClick={save} disabled={busy || !canManage}
              className="flex-1 py-6 bg-[#133B2E] text-[#D4AF37] font-bold rounded-2xl hover:bg-[#133B2E]/90">
              <Save size={16} className="ml-2" /> {busy ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={toggleArchive} disabled={busy || !canManage}
              className={`py-6 rounded-2xl ${archived ? "border-green-200 text-green-700 hover:bg-green-50" : "border-amber-200 text-amber-700 hover:bg-amber-50"}`}>
              {archived ? <><ArchiveRestore size={16} className="ml-2" /> إخراج من الأرشيف</> : <><Archive size={16} className="ml-2" /> أرشفة</>}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            الأرشفة ليست حذفاً — المستند يخرج من القوائم النشطة ويبقى في تبويب الأرشيف قابلاً للبحث والاسترجاع.
          </p>
        </div>
      </div>
    </div>
  );
}
