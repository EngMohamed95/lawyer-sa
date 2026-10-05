import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  serverTimestamp,
  startAfter,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { storage } from "./firebase";
import { ref, uploadBytes, getBlob, deleteObject } from "firebase/storage";

export const SUPPORT_STATUSES = {
  OPEN: "مفتوحة / جديدة",
  IN_PROGRESS: "قيد المعالجة",
  WAITING: "بانتظار ردك",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
} as const;
export const SUPPORT_PRIORITIES = {
  LOW: "منخفضة",
  NORMAL: "عادية",
  HIGH: "عالية",
  URGENT: "عاجلة",
} as const;
export const SUPPORT_CATEGORIES = [
  "مشكلة تقنية أو عطل في النظام",
  "الحساب والصلاحيات",
  "الاشتراكات والفواتير والمدفوعات",
  "اقتراح وتطوير",
  "استفسار عام أو مساعدة",
] as const;
export type SupportStatus = keyof typeof SUPPORT_STATUSES;
export type SupportPriority = keyof typeof SUPPORT_PRIORITIES;
export type SupportProfile = {
  uid: string;
  name: string;
  lawyerId: string;
  isAdmin: boolean;
};
export type SupportAttachment = {
  name: string;
  path: string;
  size: number;
  type: string;
};
export type SupportTicket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  priority: SupportPriority;
  status: SupportStatus;
  createdBy: string;
  requesterName: string;
  lawyerId: string;
  attachments: SupportAttachment[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  lastMessageId: string;
  lastReplyBy: string;
  messageCount: number;
};
export type SupportMessage = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  isAdmin: boolean;
  createdAt: Timestamp | null;
  attachments: SupportAttachment[];
};
const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export function validateSupportFiles(files: File[]) {
  if (files.length > 4) throw new Error("يمكنك إرفاق 4 ملفات كحد أقصى.");
  if (
    files.some(
      (file) =>
        !FILE_TYPES.includes(file.type) ||
        file.size > 5 * 1024 * 1024 ||
        file.size === 0,
    )
  )
    throw new Error(
      "الملفات المسموحة PNG وJPG وWEBP وPDF، بحد أقصى 5 ميجابايت للملف.",
    );
}
async function uploadSupportFiles(
  profile: SupportProfile,
  ticketId: string,
  files: File[],
) {
  validateSupportFiles(files);
  const uploaded: SupportAttachment[] = [];
  try {
    // Sequential uploads cap memory and bandwidth usage on mobile connections.
    for (const file of files) {
      const path = `supportAttachments/${ticketId}/${profile.uid}/${crypto.randomUUID()}`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      uploaded.push({
        name: file.name.slice(0, 200),
        path,
        size: file.size,
        type: file.type,
      });
    }
    return uploaded;
  } catch (error) {
    await cleanSupportUploads(uploaded);
    throw error;
  }
}
async function cleanSupportUploads(files: SupportAttachment[]) {
  await Promise.allSettled(
    files.map((file) => deleteObject(ref(storage, file.path))),
  );
}
export async function downloadSupportAttachment(file: SupportAttachment) {
  const blob = await getBlob(ref(storage, file.path), 5 * 1024 * 1024);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function loadSupportProfile(): Promise<SupportProfile> {
  const user = auth.currentUser;
  if (!user) throw new Error("يرجى تسجيل الدخول من جديد.");
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) throw new Error("تعذّر العثور على حساب المستخدم.");
  const data = snap.data();
  return {
    uid: user.uid,
    name: data.name || user.displayName || "مستخدم",
    lawyerId: data.lawyerId || user.uid,
    isAdmin: data.role === "SUPER_ADMIN",
  };
}

export type SupportCursor = QueryDocumentSnapshot;
export type SupportFilters = {
  status?: string;
  priority?: string;
  search?: string;
};
export type SupportStats = {
  total: number;
  active: number;
  waiting: number;
  closed: number;
};
const scope = (profile: SupportProfile): QueryConstraint[] =>
  profile.isAdmin ? [] : [where("createdBy", "==", profile.uid)];
export function watchSupportTickets(
  profile: SupportProfile,
  filters: SupportFilters,
  cursor: SupportCursor | null,
  next: (
    tickets: SupportTicket[],
    cursor: SupportCursor | null,
    hasMore: boolean,
  ) => void,
  error: (error: Error) => void,
) {
  // This base query only uses built-in indexes, so a newly deployed support
  // screen works immediately. The result is capped, then filtered and paged
  // in memory. Dedicated composite indexes can still be deployed later.
  const constraints = profile.isAdmin
    ? [orderBy("createdAt", "desc"), limit(200)]
    : [where("createdBy", "==", profile.uid), limit(200)];
  return onSnapshot(
    query(collection(db, "supportTickets"), ...constraints),
    (snapshot) => {
      const term = filters.search?.trim().toLocaleLowerCase("ar") || "";
      const all = snapshot.docs
        .filter((d) => {
          const data = d.data();
          const matchesSearch = !term ||
            (term.startsWith("#")
              ? d.id.toLocaleLowerCase("ar") === term.slice(1)
              : String(data.subject || "").toLocaleLowerCase("ar").startsWith(term));
          return matchesSearch &&
            (!filters.status || data.status === filters.status) &&
            (!filters.priority || data.priority === filters.priority);
        })
        .sort((a, b) =>
          (b.data().createdAt?.toMillis?.() || 0) -
          (a.data().createdAt?.toMillis?.() || 0),
        );
      const offset = cursor
        ? Math.max(0, all.findIndex((d) => d.id === cursor.id) + 1)
        : 0;
      const docs = all.slice(offset, offset + 10);
      next(
        docs.map((d) => ({ ...d.data(), id: d.id }) as SupportTicket),
        docs.at(-1) || null,
        all.length > offset + 10,
      );
    },
    error,
  );
}

export async function getSupportStats(
  profile: SupportProfile,
): Promise<SupportStats> {
  if (!profile.isAdmin) {
    const snapshot = await getDocs(
      query(
        collection(db, "supportTickets"),
        where("createdBy", "==", profile.uid),
        limit(1000),
      ),
    );
    const statuses = snapshot.docs.map((ticket) => ticket.data().status);
    return {
      total: statuses.length,
      active: statuses.filter((status) => status === "OPEN" || status === "IN_PROGRESS").length,
      waiting: statuses.filter((status) => status === "WAITING").length,
      closed: statuses.filter((status) => status === "RESOLVED" || status === "CLOSED").length,
    };
  }
  const count = async (statuses?: SupportStatus[]) =>
    (
      await getCountFromServer(
        query(
          collection(db, "supportTickets"),
          ...scope(profile),
          ...(statuses ? [where("status", "in", statuses)] : []),
        ),
      )
    ).data().count;
  const [total, active, waiting, closed] = await Promise.all([
    count(),
    count(["OPEN", "IN_PROGRESS"]),
    count(["WAITING"]),
    count(["RESOLVED", "CLOSED"]),
  ]);
  return { total, active, waiting, closed };
}

export function watchSupportTicket(
  id: string,
  next: (ticket: SupportTicket | null) => void,
  error: (error: Error) => void,
) {
  return onSnapshot(
    doc(db, "supportTickets", id),
    (snapshot) =>
      next(
        snapshot.exists()
          ? ({ ...snapshot.data(), id: snapshot.id } as SupportTicket)
          : null,
      ),
    error,
  );
}
export function watchSupportMessages(
  id: string,
  next: (
    messages: SupportMessage[],
    cursor: SupportCursor | null,
    hasMore: boolean,
  ) => void,
  error: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(db, "supportTickets", id, "messages"),
      orderBy("createdAt", "desc"),
      limit(30),
    ),
    (snapshot) => {
      next(
        snapshot.docs
          .map((d) => ({ ...d.data(), id: d.id }) as SupportMessage)
          .reverse(),
        snapshot.docs.at(-1) || null,
        snapshot.size === 30,
      );
    },
    error,
  );
}
export async function loadOlderSupportMessages(
  id: string,
  cursor: SupportCursor,
) {
  const snapshot = await getDocs(
    query(
      collection(db, "supportTickets", id, "messages"),
      orderBy("createdAt", "desc"),
      startAfter(cursor),
      limit(30),
    ),
  );
  return {
    messages: snapshot.docs
      .map((d) => ({ ...d.data(), id: d.id }) as SupportMessage)
      .reverse(),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.size === 30,
  };
}

export async function createSupportTicket(
  profile: SupportProfile,
  input: {
    subject: string;
    description: string;
    category: string;
    priority: SupportPriority;
  },
  files: File[] = [],
) {
  const subject = input.subject.trim(),
    description = input.description.trim();
  if (
    subject.length < 3 ||
    subject.length > 200 ||
    description.length < 10 ||
    description.length > 3000
  )
    throw new Error("أدخل عنوانًا من 3 إلى 200 حرف ووصفًا من 10 إلى 3000 حرف.");
  const ref = doc(collection(db, "supportTickets"));
  const attachments = await uploadSupportFiles(profile, ref.id, files);
  try {
    await setDoc(ref, {
      ...input,
      subject,
      description,
      attachments,
      createdBy: profile.uid,
      requesterName: profile.name,
      lawyerId: profile.lawyerId,
      status: "OPEN",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageId: "",
      lastReplyBy: "",
      messageCount: 1,
    });
  } catch (error) {
    await cleanSupportUploads(attachments);
    throw error;
  }
  return ref.id;
}

export async function replyToSupportTicket(
  profile: SupportProfile,
  ticketId: string,
  text: string,
  files: File[] = [],
) {
  const body = text.trim();
  if ((!body && !files.length) || body.length > 10000)
    throw new Error("اكتب ردًا لا يتجاوز 10000 حرف أو أرفق ملفًا.");
  const ticketRef = doc(db, "supportTickets", ticketId);
  const messageRef = doc(collection(ticketRef, "messages"));
  const attachments = await uploadSupportFiles(profile, ticketId, files);
  try {
    // A server-side increment avoids stale count conflicts when both sides reply together.
    // Rules check the current ticket state and bind the new message to this atomic batch.
    const transaction = writeBatch(db);
    transaction.set(messageRef, {
      body,
      attachments,
      senderId: profile.uid,
      senderName: profile.name,
      isAdmin: profile.isAdmin,
      createdAt: serverTimestamp(),
    });
    transaction.update(ticketRef, {
      status: profile.isAdmin ? "WAITING" : "OPEN",
      updatedAt: serverTimestamp(),
      lastMessageId: messageRef.id,
      lastReplyBy: profile.isAdmin ? "ADMIN" : "USER",
      messageCount: increment(1),
    });
    await transaction.commit();
  } catch (error) {
    await cleanSupportUploads(attachments);
    throw error;
  }
}

export async function changeSupportStatus(
  ticketId: string,
  status: SupportStatus,
) {
  await updateDoc(doc(db, "supportTickets", ticketId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export function supportError(error: unknown) {
  if ((error as { code?: string })?.code === "failed-precondition")
    return "قاعدة البيانات ما زالت تُجهّز الفهارس المطلوبة. أعد المحاولة بعد قليل.";
  if ((error as { code?: string })?.code === "permission-denied")
    return "تعذّر الوصول للدعم الفني. تحقق من صلاحية حسابك أو تواصل مع إدارة المنصة.";
  return error instanceof Error
    ? error.message
    : "تعذّر تنفيذ العملية. حاول مرة أخرى.";
}
