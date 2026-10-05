import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { loadSupportProfile, type SupportProfile } from "./support";

export const SUGGESTION_STATUSES = {
  RECEIVED: "قيد الاستلام / جديد",
  UNDER_REVIEW: "قيد الدراسة",
  PLANNED: "قيد التطوير / مجدول",
  IMPLEMENTED: "تم التنفيذ",
  DECLINED: "غير معتمد",
} as const;
export const SUGGESTION_CATEGORIES = [
  "واجهة وتجربة المستخدم",
  "إدارة القضايا والجلسات",
  "الحسابات والتقارير",
  "المستندات والعقود",
  "الذكاء الاصطناعي",
  "ميزة جديدة أخرى",
] as const;

export type SuggestionStatus = keyof typeof SUGGESTION_STATUSES;
export type SuggestionProfile = SupportProfile;
export type ProductSuggestion = {
  id: string;
  title: string;
  details: string;
  category: string;
  status: SuggestionStatus;
  createdBy: string;
  requesterName: string;
  lawyerId: string;
  adminResponse: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  respondedAt: Timestamp | null;
};
export type SuggestionStats = {
  total: number;
  reviewing: number;
  planned: number;
  implemented: number;
};

export const loadSuggestionProfile = loadSupportProfile;

function baseQuery(profile: SuggestionProfile) {
  return profile.isAdmin
    ? query(collection(db, "productSuggestions"), orderBy("createdAt", "desc"), limit(300))
    : query(collection(db, "productSuggestions"), where("createdBy", "==", profile.uid), limit(300));
}

export function watchSuggestions(
  profile: SuggestionProfile,
  next: (items: ProductSuggestion[]) => void,
  error: (error: Error) => void,
) {
  return onSnapshot(
    baseQuery(profile),
    (snapshot) =>
      next(
        snapshot.docs
          .map((item) => ({ ...item.data(), id: item.id }) as ProductSuggestion)
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
          ),
      ),
    error,
  );
}

export async function getSuggestionStats(profile: SuggestionProfile): Promise<SuggestionStats> {
  const snapshot = await getDocs(baseQuery(profile));
  const statuses = snapshot.docs.map((item) => item.data().status as SuggestionStatus);
  return {
    total: statuses.length,
    reviewing: statuses.filter((status) => status === "RECEIVED" || status === "UNDER_REVIEW").length,
    planned: statuses.filter((status) => status === "PLANNED").length,
    implemented: statuses.filter((status) => status === "IMPLEMENTED").length,
  };
}

export async function createSuggestion(
  profile: SuggestionProfile,
  input: { title: string; details: string; category: string },
) {
  const title = input.title.trim();
  const details = input.details.trim();
  if (title.length < 3 || title.length > 200 || details.length < 10 || details.length > 4000)
    throw new Error("أدخل عنوانًا من 3 إلى 200 حرف وتفاصيل من 10 إلى 4000 حرف.");
  return addDoc(collection(db, "productSuggestions"), {
    title,
    details,
    category: input.category,
    status: "RECEIVED",
    createdBy: profile.uid,
    requesterName: profile.name,
    lawyerId: profile.lawyerId,
    adminResponse: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    respondedAt: null,
  });
}

export async function reviewSuggestion(
  id: string,
  status: SuggestionStatus,
  adminResponse: string,
) {
  const response = adminResponse.trim();
  if (response.length > 4000) throw new Error("رد الإدارة لا يمكن أن يتجاوز 4000 حرف.");
  await updateDoc(doc(db, "productSuggestions", id), {
    status,
    adminResponse: response,
    updatedAt: serverTimestamp(),
    respondedAt: response ? serverTimestamp() : null,
  });
}

export function suggestionError(error: unknown) {
  if ((error as { code?: string })?.code === "permission-denied")
    return "تعذّر الوصول إلى مركز المقترحات. تحقق من صلاحية الحساب.";
  return error instanceof Error ? error.message : "تعذّر تنفيذ العملية. حاول مرة أخرى.";
}
