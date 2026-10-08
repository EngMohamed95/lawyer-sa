/**
 * تبويب «أطراف الدعوى» بتصميم ناجز — قائمة المدعين وقائمة المدعى عليهم.
 *
 * الأطراف تُحفظ في `cases/{id}.parties`. القضايا القديمة لا تحمل هذا الحقل،
 * فتُشتق أطرافها من plaintiffName/defendantName حتى أول حفظ.
 * عند الحفظ تُحدَّث plaintiffName/defendantName أيضاً لأن المذكرات والجلسات تقرأ منها.
 */

import { useState, type ReactNode } from "react";
import { Briefcase, Pencil, Plus, Trash2, UserRound, X, Check } from "lucide-react";

export type PartyRole = "PLAINTIFF" | "DEFENDANT";

export interface CaseParty {
  id: string;
  name: string;
  role: PartyRole;
  nationalId?: string;
  nationality?: string;
  isClient?: boolean;
  /** ممثل الطرف (محامٍ أو وكيل) — اختياري */
  representativeName?: string;
  representativeType?: string;
  /** رقم رخصة المحاماة أو رقم الوكالة */
  representativeNumber?: string;
}

const ROLE_LABEL: Record<PartyRole, string> = { PLAINTIFF: "المدعي", DEFENDANT: "مدعى عليه" };

export const REPRESENTATIVE_TYPES = ["محامٍ", "وكيل شرعي", "ممثل نظامي", "ولي / وصي"];

const newId = () => Math.random().toString(36).slice(2, 10);

/** أطراف القضية المحفوظة، أو مشتقة من الحقول القديمة */
export function partiesOf(c: any): CaseParty[] {
  if (Array.isArray(c?.parties)) return c.parties;
  const clientIsDefendant = c?.clientRole === "DEFENDANT";
  const clientName = c?.client?.fullName || "";
  const plaintiff = c?.plaintiffName || (clientIsDefendant ? c?.opponentName : clientName) || "";
  const defendant = c?.defendantName || (clientIsDefendant ? clientName : c?.opponentName) || "";
  const out: CaseParty[] = [];
  if (plaintiff) out.push({
    id: "p1", name: plaintiff, role: "PLAINTIFF",
    isClient: !clientIsDefendant && plaintiff === clientName,
    nationalId: !clientIsDefendant && plaintiff === clientName ? c?.client?.nationalId || "" : "",
  });
  if (defendant) out.push({
    id: "d1", name: defendant, role: "DEFENDANT",
    isClient: clientIsDefendant && defendant === clientName,
    nationalId: clientIsDefendant && defendant === clientName ? c?.client?.nationalId || "" : "",
  });
  // محامي الخصم من الحقل القديم يظهر ممثلاً للطرف الخصم
  const opponent = out.find((p) => !p.isClient);
  if (opponent && c?.opponentLawyer) {
    opponent.representativeName = c.opponentLawyer;
    opponent.representativeType = "محامٍ";
  }
  return out;
}

export default function CaseParties({ caseData, onSave }: {
  caseData: any;
  onSave: (parties: CaseParty[]) => Promise<void>;
}) {
  const parties = partiesOf(caseData);
  const [editing, setEditing] = useState<CaseParty | null>(null);
  const [saving, setSaving] = useState(false);

  const persist = async (next: CaseParty[]) => {
    setSaving(true);
    try {
      // Firestore يرفض القيم undefined — كل حقل يُحفظ بقيمة صريحة
      await onSave(next.map((p) => ({
        id: p.id, name: p.name, role: p.role,
        nationalId: p.nationalId || "", nationality: p.nationality || "", isClient: !!p.isClient,
        representativeName: p.representativeName || "",
        representativeType: p.representativeName ? p.representativeType || REPRESENTATIVE_TYPES[0] : "",
        representativeNumber: p.representativeName ? p.representativeNumber || "" : "",
      })));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const submit = (p: CaseParty) => {
    if (!p.name.trim()) return;
    const clean = {
      ...p, name: p.name.trim(), nationalId: p.nationalId?.trim(), nationality: p.nationality?.trim(),
      representativeName: p.representativeName?.trim(), representativeNumber: p.representativeNumber?.trim(),
    };
    const exists = parties.some((x) => x.id === p.id);
    void persist(exists ? parties.map((x) => (x.id === p.id ? clean : x)) : [...parties, clean]);
  };

  const remove = (p: CaseParty) => {
    if (!confirm(`حذف «${p.name}» من أطراف الدعوى؟`)) return;
    void persist(parties.filter((x) => x.id !== p.id));
  };

  const column = (role: PartyRole, heading: string) => {
    const list = parties.filter((p) => p.role === role);
    const addingHere = editing && editing.role === role && !parties.some((x) => x.id === editing.id);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{heading}</h3>
          <button
            onClick={() => setEditing({ id: newId(), name: "", role, nationalId: "", nationality: "سعودي" })}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-xs font-bold text-[#1a9a45] hover:bg-green-50 transition disabled:opacity-50"
          >
            <Plus size={14} /> إضافة
          </button>
        </div>

        {list.length === 0 && !addingHere && (
          <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">لا يوجد</p>
        )}

        {list.map((p) =>
          editing?.id === p.id
            ? <PartyForm key={p.id} value={editing} onChange={setEditing} onSubmit={submit} onCancel={() => setEditing(null)} saving={saving} />
            : <PartyCard key={p.id} p={p} onEdit={() => setEditing(p)} onDelete={() => remove(p)} disabled={saving} />
        )}

        {addingHere && editing && (
          <PartyForm value={editing} onChange={setEditing} onSubmit={submit} onCancel={() => setEditing(null)} saving={saving} />
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <h2 className="text-xl font-bold text-[#1a9a45]">أطراف الدعوى</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {column("PLAINTIFF", "قائمة المدعين")}
        {column("DEFENDANT", "قائمة المدعى عليهم")}
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full border border-gray-200 bg-white text-xs text-gray-600 whitespace-nowrap">
      {children}
    </span>
  );
}

function PartyCard({ p, onEdit, onDelete, disabled }: {
  p: CaseParty; onEdit: () => void; onDelete: () => void; disabled: boolean;
}) {
  return (
    <div className="group rounded-md bg-gray-50/70 border border-gray-200 shadow-sm px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="text-base font-bold text-gray-900 truncate">{p.name}</h4>
          {p.isClient && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#8a6d12]">العميل</span>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          <button onClick={onEdit} disabled={disabled} title="تعديل"
            className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-[#133B2E]">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} disabled={disabled} title="حذف"
            className="h-7 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip>{ROLE_LABEL[p.role]}</Chip>
        {p.nationalId && <Chip>الهوية الوطنية: {p.nationalId}</Chip>}
        {p.nationality && <Chip>الجنسية: {p.nationality}</Chip>}
      </div>
      {p.representativeName && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-200 pt-2.5 text-sm">
          <Briefcase size={14} className="shrink-0 text-[#1a9a45]" />
          <span className="text-gray-500">الممثل:</span>
          <span className="font-bold text-gray-900">{p.representativeName}</span>
          {p.representativeType && <Chip>{p.representativeType}</Chip>}
          {p.representativeNumber && <Chip>رقم الرخصة / الوكالة: {p.representativeNumber}</Chip>}
        </div>
      )}
    </div>
  );
}

function PartyForm({ value, onChange, onSubmit, onCancel, saving }: {
  value: CaseParty;
  onChange: (p: CaseParty) => void;
  onSubmit: (p: CaseParty) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const input = "w-full h-9 px-3 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:border-[#1a9a45] focus:ring-1 focus:ring-[#1a9a45]";
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}
      className="rounded-md border-2 border-[#bfe3d6] bg-white px-4 py-3 space-y-2.5"
    >
      <div className="flex items-center gap-2 text-sm font-bold text-[#133B2E]">
        <UserRound size={15} /> {ROLE_LABEL[value.role]}
      </div>
      <input autoFocus required placeholder="الاسم الكامل" className={input}
        value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="رقم الهوية الوطنية" className={input} inputMode="numeric"
          value={value.nationalId || ""} onChange={(e) => onChange({ ...value, nationalId: e.target.value })} />
        <input placeholder="الجنسية" className={input}
          value={value.nationality || ""} onChange={(e) => onChange({ ...value, nationality: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={!!value.isClient} onChange={(e) => onChange({ ...value, isClient: e.target.checked })} />
        هذا الطرف هو العميل
      </label>
      <div className="space-y-2 border-t border-gray-100 pt-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#133B2E]">
          <Briefcase size={13} /> ممثل {ROLE_LABEL[value.role]} (اختياري)
        </div>
        <input placeholder="اسم الممثل" className={input}
          value={value.representativeName || ""} onChange={(e) => onChange({ ...value, representativeName: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <select className={input} value={value.representativeType || REPRESENTATIVE_TYPES[0]}
            onChange={(e) => onChange({ ...value, representativeType: e.target.value })}>
            {REPRESENTATIVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="رقم الرخصة / الوكالة" className={input}
            value={value.representativeNumber || ""} onChange={(e) => onChange({ ...value, representativeNumber: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
          <X size={13} /> إلغاء
        </button>
        <button type="submit" disabled={saving || !value.name.trim()}
          className="flex items-center gap-1 px-4 py-1.5 rounded-md bg-[#1a9a45] hover:bg-[#15803a] text-white text-xs font-bold disabled:opacity-50">
          <Check size={13} /> {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </form>
  );
}
