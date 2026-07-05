import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Plus, File, Trash2, Loader2, FolderOpen, Eye } from "lucide-react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { AddDocumentModal } from "./AddDocumentModal";
import { DocumentViewerModal } from "./DocumentViewerModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: { id: string; fullName: string } | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  POWER_OF_ATTORNEY: "توكيل",
  CONTRACT: "عقد",
  EVIDENCE: "دليل إثبات",
  JUDGMENT: "حكم",
  RECEIPT: "إيصال / حافظة",
  OTHER: "أخرى",
};

export function ClientDocumentsModal({ isOpen, onClose, client }: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<any>(null);

  const fetchDocs = async () => {
    if (!client) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(doc(db, "clients", client.id), "documents"));
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching client documents:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && client) fetchDocs();
  }, [isOpen, client?.id]);

  const handleDelete = async (docId: string) => {
    if (!client || !confirm("هل أنت متأكد من حذف هذا المستند؟")) return;
    setDeleting(docId);
    try {
      await deleteDoc(doc(db, "clients", client.id, "documents", docId));
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <DocumentViewerModal
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        document={viewingDoc}
      />

      <AddDocumentModal
        isOpen={isAddDocOpen}
        onClose={() => setIsAddDocOpen(false)}
        onSuccess={() => {
          setIsAddDocOpen(false);
          fetchDocs();
        }}
        clientId={client?.id}
      />

      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#0A192F] flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-[#D4AF37]" />
              مستندات الموكل: {client?.fullName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-gray-500">
              هذه المستندات ستظهر تلقائياً في جميع قضايا هذا الموكل
            </p>
            <Button
              className="bg-[#D4AF37] hover:bg-[#B8962E] text-white"
              onClick={() => setIsAddDocOpen(true)}
            >
              <Plus className="ml-2 h-4 w-4" /> إضافة مستند
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
              <FolderOpen className="h-12 w-12" />
              <p className="text-sm">لا توجد مستندات مضافة لهذا الموكل بعد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-right font-bold">اسم المستند</TableHead>
                  <TableHead className="text-right font-bold w-32">النوع</TableHead>
                  <TableHead className="text-right font-bold w-32">تاريخ الرفع</TableHead>
                  <TableHead className="text-center font-bold w-24">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map(d => (
                  <TableRow key={d.id} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-[#0A192F]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 rounded-lg shrink-0">
                          {d.fileType?.startsWith("image/") ? (
                            <img src={d.fileUrl} alt="" className="h-4 w-4 object-cover" />
                          ) : (
                            <File className="h-4 w-4 text-amber-600" />
                          )}
                        </div>
                        {d.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-amber-200 text-amber-700">
                        {DOC_TYPE_LABELS[d.type] || d.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(d.uploadDate).toLocaleDateString("ar-EG")}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                          onClick={() => setViewingDoc(d)}
                          title="عرض المستند"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDelete(d.id)}
                          disabled={deleting === d.id}
                          title="حذف"
                        >
                          {deleting === d.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
