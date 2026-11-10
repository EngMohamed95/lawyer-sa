/**
 * المكتبة القانونية الشخصية — محفظة خاصة بكل مستخدم.
 *
 * كل مستند في legal_library يحمل ownerId = uid صاحبه، وقواعد Firestore
 * لا تسمح بقراءته أو تعديله أو حذفه لغير صاحبه (ولا حتى مدير المكتب).
 * لذلك يجب أن يقيّد كل استعلام بـ where("ownerId", "==", uid) وإلا رُفض.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { deleteObject, getBlob, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase";

export const LIBRARY_COLLECTION = "legal_library";

export const LIBRARY_TYPES = {
  REGULATION: "نظام",
  DECISION: "قرار",
  CIRCULAR: "تعميم",
  ROYAL_ORDER: "أمر سامٍ",
} as const;

export const LIBRARY_TYPE_PLURALS: Record<LibraryItemType, string> = {
  REGULATION: "الأنظمة",
  DECISION: "القرارات",
  CIRCULAR: "التعاميم",
  ROYAL_ORDER: "الأوامر السامية",
};

export type LibraryItemType = keyof typeof LIBRARY_TYPES;

/** الحدود نفسها مفروضة في firestore.rules */
export const LIBRARY_LIMITS = {
  title: 300,
  number: 100,
  issueDate: 50,
  issuer: 200,
  summary: 2000,
  content: 300000,
  sourceUrl: 1000,
} as const;

/** الملف المرفق (كتاب PDF أو مستند Word) — محفوظ في Storage تحت legalLibrary/{uid}/ */
export interface LibraryFile {
  path: string;
  name: string;
  size: number;
  contentType: string;
}

export const LIBRARY_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** الامتداد ← نوع المحتوى. المتصفح أحياناً يترك file.type فارغاً لملفات .doc */
const ALLOWED_FILES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const LIBRARY_FILE_ACCEPT = ".pdf,.doc,.docx";

export function libraryFileKind(file: Pick<LibraryFile, "contentType" | "name">): "pdf" | "docx" | "doc" | "other" {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.contentType === ALLOWED_FILES.pdf || ext === "pdf") return "pdf";
  if (file.contentType === ALLOWED_FILES.docx || ext === "docx") return "docx";
  if (file.contentType === ALLOWED_FILES.doc || ext === "doc") return "doc";
  return "other";
}

/** يرجع رسالة خطأ بالعربية أو null إن كان الملف مقبولاً */
export function validateLibraryFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_FILES[ext]) return "الملفات المسموحة: PDF أو Word (.doc / .docx) فقط.";
  if (file.size === 0) return "الملف فارغ.";
  if (file.size > LIBRARY_MAX_FILE_BYTES) return "حجم الملف أكبر من ٥٠ ميجابايت.";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function uploadLibraryFile(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<LibraryFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const contentType = ALLOWED_FILES[ext];
  const path = `legalLibrary/${uid}/${crypto.randomUUID()}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve({ path, name: file.name.slice(0, 200), size: file.size, contentType }),
    );
  });
}

export async function deleteLibraryFile(file: LibraryFile | null | undefined) {
  if (!file?.path) return;
  try {
    await deleteObject(ref(storage, file.path));
  } catch (err: any) {
    // الملف محذوف مسبقاً — لا مشكلة
    if (err?.code !== "storage/object-not-found") throw err;
  }
}

/** التنزيل يمر عبر قواعد Storage (لا روابط عامة) — صاحب الملف وحده يستطيع */
export function fetchLibraryFile(file: LibraryFile): Promise<Blob> {
  return getBlob(ref(storage, file.path), LIBRARY_MAX_FILE_BYTES + 1024);
}

export async function downloadLibraryFile(file: LibraryFile) {
  const blob = await fetchLibraryFile(file);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export interface LibraryItemInput {
  type: LibraryItemType;
  title: string;
  number: string;
  issueDate: string;
  issuer: string;
  summary: string;
  content: string;
  sourceUrl: string;
  file: LibraryFile | null;
}

export interface LibraryItem extends LibraryItemInput {
  id: string;
  ownerId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export const EMPTY_LIBRARY_ITEM: LibraryItemInput = {
  type: "REGULATION",
  title: "",
  number: "",
  issueDate: "",
  issuer: "",
  summary: "",
  content: "",
  sourceUrl: "",
  file: null,
};

function clean(input: LibraryItemInput): LibraryItemInput {
  const cut = (v: string, max: number) => (v || "").trim().slice(0, max);
  return {
    type: input.type in LIBRARY_TYPES ? input.type : "REGULATION",
    title: cut(input.title, LIBRARY_LIMITS.title),
    number: cut(input.number, LIBRARY_LIMITS.number),
    issueDate: cut(input.issueDate, LIBRARY_LIMITS.issueDate),
    issuer: cut(input.issuer, LIBRARY_LIMITS.issuer),
    summary: cut(input.summary, LIBRARY_LIMITS.summary),
    content: (input.content || "").slice(0, LIBRARY_LIMITS.content),
    sourceUrl: cut(input.sourceUrl, LIBRARY_LIMITS.sourceUrl),
    file: input.file
      ? {
          path: input.file.path,
          name: input.file.name.slice(0, 200),
          size: input.file.size,
          contentType: input.file.contentType,
        }
      : null,
  };
}

export function watchMyLibrary(
  uid: string,
  next: (items: LibraryItem[]) => void,
  error: (error: Error) => void,
) {
  // الترتيب على العميل لتفادي الحاجة لفهرس مركّب
  return onSnapshot(
    query(collection(db, LIBRARY_COLLECTION), where("ownerId", "==", uid)),
    (snapshot) =>
      next(
        snapshot.docs
          .map((d) => ({ ...EMPTY_LIBRARY_ITEM, ...d.data(), id: d.id }) as LibraryItem)
          .sort(
            (a, b) =>
              (b.updatedAt?.toMillis() || b.createdAt?.toMillis() || 0) -
              (a.updatedAt?.toMillis() || a.createdAt?.toMillis() || 0),
          ),
      ),
    error,
  );
}

export async function addLibraryItem(uid: string, input: LibraryItemInput) {
  return addDoc(collection(db, LIBRARY_COLLECTION), {
    ...clean(input),
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateLibraryItem(id: string, input: LibraryItemInput) {
  return updateDoc(doc(db, LIBRARY_COLLECTION, id), {
    ...clean(input),
    updatedAt: serverTimestamp(),
  });
}

/** يحذف المستند ثم ملفه المرفق */
export async function deleteLibraryItem(item: Pick<LibraryItem, "id" | "file">) {
  await deleteDoc(doc(db, LIBRARY_COLLECTION, item.id));
  await deleteLibraryFile(item.file).catch((err) =>
    console.warn("حُذفت المادة لكن تعذّر حذف ملفها:", err),
  );
}
