import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Sparkles } from "lucide-react";

export function AiSummarizerModal({ isOpen, onClose, target, type }: { isOpen: boolean, onClose: () => void, target: any, type: 'case' | 'document' | 'memo' }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = () => {
    setLoading(true);
    // Simulate AI delay
    setTimeout(() => {
      setResult(`هذا ملخص ذكي مُوّلد بالذكاء الاصطناعي لـ ${type === 'case' ? 'القضية' : 'المستند'} "${target?.title || target?.name || ''}".
      
- تشير المعطيات إلى وجود احتمالية عالية لكسب القضية في حال تقديم مستندات الإثبات في الجلسة القادمة.
- ينصح بمراجعة المذكرة المقدمة للتركيز على الجانب التعويضي.
- تم استخراج ٣ تواريخ هامة تتعلق بسير الدعوى و٢ طلبات أساسية للمحكمة.

(هذا ملخص تجريبي - سيتم ربط الـ API لاحقاً)`);
      setLoading(false);
    }, 2000);
  };

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700">
            <Sparkles size={20} />
            الذكاء الاصطناعي (AI)
          </DialogTitle>
          <DialogDescription className="text-right">
            قم بإنشاء ملخص ذكي أو استخراج أهم النقاط القانونية بنقرة واحدة.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!result && !loading && (
            <div className="text-center py-8">
              <Button onClick={handleGenerate} className="bg-purple-600 hover:bg-purple-700 text-white">
                <Sparkles className="ml-2 h-4 w-4" />
                توليد الملخص الآن
              </Button>
            </div>
          )}

          {loading && (
            <div className="text-center py-8 flex flex-col items-center gap-4 text-purple-600">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>جاري تحليل البيانات واستخراج الملخص...</p>
            </div>
          )}

          {result && (
            <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
              {result}
            </div>
          )}
        </div>

        {result && (
          <DialogFooter className="sm:justify-start">
            <Button variant="outline" onClick={handleClose}>إغلاق</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
