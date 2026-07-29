import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Calendar, Loader2 } from "lucide-react";

interface HearingSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  hearings: any[];
  onConfirm: (hearingId: string) => Promise<void>;
  loading: boolean;
}

export function HearingSelectModal({
  isOpen,
  onClose,
  hearings,
  onConfirm,
  loading
}: HearingSelectModalProps) {
  const [selectedHearingId, setSelectedHearingId] = useState<string>("");

  const handleConfirm = async () => {
    if (!selectedHearingId) {
      alert("الرجاء اختيار جلسة أولاً");
      return;
    }
    await onConfirm(selectedHearingId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[#133B2E] flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#D4AF37]" /> اعتماد المذكرة وإرفاقها بجلسة
          </DialogTitle>
          <DialogDescription className="text-gray-500 mt-1">
            اختر الجلسة التي ترغب في إرفاق هذه المذكرة بها كملف PDF معتمد.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-4 max-h-[300px] overflow-y-auto">
          {hearings.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm bg-gray-50 rounded-xl">
              لا توجد جلسات مسجلة لهذه القضية حالياً.
            </div>
          ) : (
            <div className="space-y-2">
              {hearings.map((h) => {
                const dateStr = new Date(h.hearingDate).toLocaleDateString("ar-EG", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                });
                return (
                  <label
                    key={h.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedHearingId === h.id
                        ? "border-[#D4AF37] bg-[#133B2E]/5"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedHearing"
                      value={h.id}
                      checked={selectedHearingId === h.id}
                      onChange={() => setSelectedHearingId(h.id)}
                      className="mt-1 accent-[#D4AF37]"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-sm text-[#133B2E]">{dateStr}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {h.court || "المحكمة غير محددة"} {h.circuit ? `— دائرة: ${h.circuit}` : ""}
                      </p>
                      {h.requiredActions && (
                        <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">
                          الإجراء: {h.requiredActions}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            className="bg-[#133B2E] hover:bg-[#133B2E]/90 text-white flex items-center gap-2"
            onClick={handleConfirm}
            disabled={loading || hearings.length === 0 || !selectedHearingId}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            اعتماد وتحويل لـ PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
