/**
 * بديل "firebase/firestore" أثناء التحويل لـ MySQL على مراحل.
 *
 * كل الواجهة تستورد من هنا بدل firebase/firestore. نفس الدوال ونفس الأنواع، لكن:
 *   - المجموعات اللي انتقلت (MIGRATED_ROOTS ومجموعاتها الفرعية) تروح لـ /api/v1/data
 *     والسيرفر يطبّق الصلاحيات (public/api/_lib/store.php)
 *   - الباقي يروح Firestore كما هو بدون أي تغيير
 * كل مرحلة جديدة = إضافة أسماء المجموعات هنا وفي STORE_ROOTS في store.php + نقل بياناتها.
 *
 * فروق مقصودة عن Firestore للمجموعات المنقولة:
 *   - onSnapshot يجيب البيانات مرة وحدة (ما في تحديث فوري) — ولا وحدة من المجموعات المنقولة تستخدمه
 *   - serverTimestamp() = وقت الجهاز بصيغة ISO (المجموعات المنقولة تخزن التواريخ نصوصاً أصلاً)
 *   - writeBatch فيه عمليات على الطرفين = دفعتين منفصلتين (كل طرف ذرّي لحاله)
 */

import * as fs from "firebase/firestore";
import { apiRequest, ApiError } from "./authApi";

export * from "firebase/firestore";

/** لازم تطابق STORE_ROOTS في public/api/_lib/store.php */
export const MIGRATED_ROOTS: ReadonlySet<string> = new Set([
  "cases", "clients", "tasks",
  // المرحلة 3
  "payments", "expenses", "contracts", "invoices", "receipts", "vouchers", "fee_agreements", "time_entries",
  "appointments", "client_messages", "client_requests", "template_folders", "custom_templates", "general_memos",
  "notifications", "notification_preferences", "office_settings", "client_portal_accounts",
  "auditLogs", "documents_access_log",
  // الدفعة 2 — المنصة وسير العمل الخاص
  "supportTickets", "productSuggestions", "legal_library", "ai_conversations", "ai_usage",
  "platform_status", "platform_settings", "subscriptionPlans", "subscriptionRequests",
]);
/** استعلامات collectionGroup اللي كل مستنداتها تحت مجموعات منقولة — تطابق STORE_GROUPS */
const MIGRATED_GROUPS: ReadonlySet<string> = new Set(["hearings", "documents", "requests", "memos"]);

const MZ = Symbol.for("mawazzen.store");
const PAGE_SIZE = 500;

/* ───────────────────────────── المراجع ───────────────────────────── */

interface MzCollectionRef {
  [MZ]: "collection";
  type: "collection";
  id: string;
  path: string;
  parent: MzDocRef | null;
  firestore: fs.Firestore;
}

interface MzDocRef {
  [MZ]: "document";
  type: "document";
  id: string;
  path: string;
  parent: MzCollectionRef;
  firestore: fs.Firestore;
}

type WhereClause = [string, string, unknown];
type OrderClause = [string, "asc" | "desc"];

interface MzQuery {
  [MZ]: "query";
  type: "query";
  firestore: fs.Firestore;
  source: { path: string } | { group: string };
  where: ServerPredicate[];
  orderBy: OrderClause[];
  limit?: number;
}

interface MzConstraint {
  [MZ]: "constraint";
  kind: "where" | "orderBy" | "limit" | "and" | "or";
  /** نفس خاصية type في قيود Firestore — كود مثل visibleCasesQuery يفرز بها */
  type: "where" | "orderBy" | "limit" | "and" | "or";
  args: unknown[];
  /** نفس القيد لـ Firestore — يُستخدم لو الاستعلام على مجموعة ما انتقلت */
  real: any;
}

/** شرط بصيغة السيرفر: [field, op, value] أو {or: [...]} / {and: [...]} */
type ServerPredicate = WhereClause | { or: ServerPredicate[] } | { and: ServerPredicate[] };

const mzKind = (x: unknown): string | undefined =>
  x !== null && typeof x === "object" ? (x as Record<symbol, string>)[MZ] : undefined;

const trimPath = (p: string) => p.replace(/^\/+|\/+$/g, "");
const isMigratedPath = (path: string) => MIGRATED_ROOTS.has(trimPath(path).split("/")[0]);

function makeCollectionRef(db: fs.Firestore, path: string): MzCollectionRef {
  const segs = trimPath(path).split("/");
  return {
    [MZ]: "collection",
    type: "collection",
    id: segs[segs.length - 1],
    path: segs.join("/"),
    get parent() { return segs.length > 1 ? makeDocRef(db, segs.slice(0, -1).join("/")) : null; },
    firestore: db,
  } as MzCollectionRef;
}

function makeDocRef(db: fs.Firestore, path: string): MzDocRef {
  const segs = trimPath(path).split("/");
  return {
    [MZ]: "document",
    type: "document",
    id: segs[segs.length - 1],
    path: segs.join("/"),
    get parent() { return makeCollectionRef(db, segs.slice(0, -1).join("/")); },
    firestore: db,
  } as MzDocRef;
}

/** معرّف بنفس شكل معرّفات Firestore التلقائية (20 حرف) */
function autoId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** مسار كامل ومثيل Firestore من (db | مرجع, ...أجزاء) */
function resolve(parent: any, segments: string[]): { db: fs.Firestore; full: string } {
  const rel = segments.filter((s) => s !== undefined).join("/");
  if (parent && (parent.type === "document" || parent.type === "collection")) {
    return { db: parent.firestore, full: trimPath(`${parent.path}/${rel}`) };
  }
  return { db: parent as fs.Firestore, full: trimPath(rel) };
}

export const collection = ((parent: any, path: string, ...rest: string[]) => {
  const { db, full } = resolve(parent, [path, ...rest]);
  return isMigratedPath(full) ? makeCollectionRef(db, full) : fs.collection(db, full);
}) as typeof fs.collection;

export const doc = ((parent: any, path?: string, ...rest: string[]) => {
  // doc(collectionRef) — معرّف تلقائي
  if (path === undefined && parent && parent.type === "collection") {
    return mzKind(parent) === "collection" ? makeDocRef(parent.firestore, `${parent.path}/${autoId()}`) : fs.doc(parent);
  }
  const { db, full } = resolve(parent, [path as string, ...rest]);
  return isMigratedPath(full) ? makeDocRef(db, full) : fs.doc(db, full);
}) as typeof fs.doc;

export const collectionGroup = ((db: fs.Firestore, id: string) => {
  if (!MIGRATED_GROUPS.has(id)) return fs.collectionGroup(db, id);
  const q: MzQuery = { [MZ]: "query", type: "query", firestore: db, source: { group: id }, where: [], orderBy: [] };
  return q;
}) as unknown as typeof fs.collectionGroup;

/* ───────────────────────────── الاستعلامات ───────────────────────────── */

const constraint = (kind: MzConstraint["kind"], args: unknown[], real: any): MzConstraint =>
  ({ [MZ]: "constraint", kind, type: kind, args, real });

export const where = ((field: any, op: any, value: any) => {
  const real = fs.where(field, op, value);
  if (typeof field !== "string") return real; // FieldPath/documentId — Firestore فقط
  return constraint("where", [field, op, value], real);
}) as unknown as typeof fs.where;

export const orderBy = ((field: any, dir: any = "asc") => {
  const real = fs.orderBy(field, dir);
  if (typeof field !== "string") return real;
  return constraint("orderBy", [field, dir], real);
}) as unknown as typeof fs.orderBy;

export const limit = ((n: number) => constraint("limit", [n], fs.limit(n))) as unknown as typeof fs.limit;

const toReal = (c: any) => (mzKind(c) === "constraint" ? (c as MzConstraint).real : c);

/** and()/or() — مركّب من where أو مركّبات ثانية */
export const and = ((...filters: any[]) => constraint("and", filters, fs.and(...filters.map(toReal)))) as unknown as typeof fs.and;
export const or = ((...filters: any[]) => constraint("or", filters, fs.or(...filters.map(toReal)))) as unknown as typeof fs.or;

/** قيد where/and/or ← صيغة السيرفر */
function toPredicate(c: any): ServerPredicate {
  if (mzKind(c) !== "constraint") throw new Error("شرط غير مدعوم على بيانات MySQL (المدعوم: where وand وor).");
  const { kind, args } = c as MzConstraint;
  if (kind === "where") return args as WhereClause;
  if (kind === "and") return { and: args.map(toPredicate) };
  if (kind === "or") return { or: args.map(toPredicate) };
  throw new Error("شرط غير مدعوم داخل and/or.");
}

export const query = ((base: any, ...constraints: any[]) => {
  const kind = mzKind(base);
  if (kind !== "collection" && kind !== "query") return fs.query(base, ...constraints.map(toReal));

  const q: MzQuery = kind === "query"
    ? { ...(base as MzQuery), where: [...base.where], orderBy: [...base.orderBy] }
    : { [MZ]: "query", type: "query", firestore: base.firestore, source: { path: base.path }, where: [], orderBy: [] };
  for (const c of constraints.flat()) {
    if (mzKind(c) !== "constraint") {
      throw new Error("قيد استعلام غير مدعوم على بيانات MySQL (المدعوم: where وorderBy وlimit).");
    }
    const { kind: k, args } = c as MzConstraint;
    if (k === "orderBy") q.orderBy.push(args as OrderClause);
    else if (k === "limit") q.limit = args[0] as number;
    else if (k === "and") q.where.push(...args.map(toPredicate)); // and على المستوى الأعلى = شروط عادية
    else q.where.push(toPredicate(c));
  }
  return q;
}) as typeof fs.query;

/* ───────────────────────────── الأخطاء ───────────────────────────── */

/** نفس شكل أخطاء Firestore (err.code) عشان معالجات الأخطاء الموجودة تشتغل */
class StoreError extends Error {
  name = "FirebaseError";
  constructor(readonly code: string, message: string) { super(message); }
}

const CODE_MAP: Record<number, string> = {
  0: "unavailable", 400: "invalid-argument", 401: "unauthenticated", 403: "permission-denied",
  404: "not-found", 409: "already-exists", 413: "resource-exhausted", 429: "resource-exhausted",
};

async function call<T>(path: string, body: unknown): Promise<T> {
  try {
    return await apiRequest<T>("POST", path, body);
  } catch (err) {
    if (err instanceof ApiError) throw new StoreError(CODE_MAP[err.status] ?? "internal", err.message);
    throw err;
  }
}

/* ───────────────────────────── اللقطات (snapshots) ───────────────────────────── */

interface RawDoc { path: string; id: string; data?: Record<string, unknown> }

function getField(data: any, field: string): unknown {
  return field.split(".").reduce((v, k) => (v !== null && typeof v === "object" ? v[k] : undefined), data);
}

function makeDocSnapshot(db: fs.Firestore, path: string, data: Record<string, unknown> | undefined) {
  const ref = makeDocRef(db, path);
  return {
    id: ref.id,
    ref,
    exists: () => data !== undefined,
    // نسخة جديدة كل مرة — مثل Firestore، تعديلها ما يأثر على اللقطة
    data: () => (data === undefined ? undefined : structuredClone(data)),
    get: (field: string) => getField(data, field),
    metadata: { hasPendingWrites: false, fromCache: false, isEqual: () => true },
  };
}

function makeQuerySnapshot(db: fs.Firestore, q: MzQuery, rows: RawDoc[]) {
  const docs = rows.map((r) => makeDocSnapshot(db, r.path, r.data ?? {}));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    query: q,
    forEach: (cb: (d: (typeof docs)[number]) => void, thisArg?: unknown) => docs.forEach(cb, thisArg),
    docChanges: () => docs.map((d, i) => ({ type: "added" as const, doc: d, oldIndex: -1, newIndex: i })),
    metadata: { hasPendingWrites: false, fromCache: false, isEqual: () => true },
  };
}

function queryRequest(q: MzQuery) {
  return { ...q.source, where: q.where, orderBy: q.orderBy };
}

/** يجيب كل النتائج (أو حتى limit) صفحة صفحة — السيرفر يحد الصفحة بـ 1000 */
async function runQuery(q: MzQuery): Promise<RawDoc[]> {
  const out: RawDoc[] = [];
  const max = q.limit ?? Infinity;
  for (let offset = 0; out.length < max; offset += PAGE_SIZE) {
    const pageLimit = Math.min(PAGE_SIZE, max - out.length);
    const res = await call<{ docs: RawDoc[]; hasMore: boolean }>("data/query", { ...queryRequest(q), limit: pageLimit, offset });
    out.push(...res.docs);
    if (!res.hasMore) break;
  }
  return out;
}

const asQuery = (x: any): MzQuery | null => {
  const k = mzKind(x);
  if (k === "query") return x as MzQuery;
  if (k === "collection") return { [MZ]: "query", type: "query", firestore: x.firestore, source: { path: x.path }, where: [], orderBy: [] };
  return null;
};

export const getDocs = (async (q: any) => {
  const mq = asQuery(q);
  if (!mq) return fs.getDocs(q);
  return makeQuerySnapshot(mq.firestore, mq, await runQuery(mq));
}) as unknown as typeof fs.getDocs;

export const getDoc = (async (ref: any) => {
  if (mzKind(ref) !== "document") return fs.getDoc(ref);
  const res = await call<RawDoc & { exists: boolean }>("data/get", { path: ref.path });
  return makeDocSnapshot(ref.firestore, ref.path, res.exists ? res.data ?? {} : undefined);
}) as unknown as typeof fs.getDoc;

export const getCountFromServer = (async (q: any) => {
  const mq = asQuery(q);
  if (!mq) return fs.getCountFromServer(q);
  const { count } = await call<{ count: number }>("data/count", queryRequest(mq));
  return { data: () => ({ count }) };
}) as unknown as typeof fs.getCountFromServer;

/** كل كم ثانية نعيد الجلب لمحاكاة التحديث الفوري (الإشعارات، الدعم…) */
const POLL_MS = 20_000;

/**
 * onSnapshot للمجموعات المنقولة = جلب دوري: كل 20 ثانية، ويبلّغ المستمع بس لو تغيّرت البيانات.
 * التبويب المخفي ما يرسل طلبات، ويجلب فوراً لما يرجع المستخدم له.
 */
export const onSnapshot = ((target: any, ...args: any[]) => {
  const k = mzKind(target);
  if (k !== "document" && k !== "collection" && k !== "query") return (fs.onSnapshot as any)(target, ...args);
  const rest = args[0] && typeof args[0] === "object" && !("next" in args[0]) && typeof args[1] !== "undefined" ? args.slice(1) : args;
  const observer = typeof rest[0] === "function" ? { next: rest[0], error: rest[1] } : rest[0] ?? {};
  let active = true;
  let last = "";
  let inFlight = false;

  const poll = () => {
    if (!active || inFlight) return;
    if (typeof document !== "undefined" && document.hidden && last !== "") return;
    inFlight = true;
    (k === "document" ? getDoc(target) : getDocs(target))
      .then((snap: any) => {
        if (!active) return;
        const key = JSON.stringify(k === "document" ? snap.data() ?? null : snap.docs.map((d: any) => [d.ref.path, d.data()]));
        if (key === last) return;
        last = key;
        observer.next?.(snap);
      })
      .catch((err: unknown) => { if (active) observer.error?.(err); })
      .finally(() => { inFlight = false; });
  };

  poll();
  const timer = setInterval(poll, POLL_MS);
  const onVisible = () => { if (typeof document !== "undefined" && !document.hidden) poll(); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  return () => {
    active = false;
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
}) as typeof fs.onSnapshot;

/* ───────────────────────────── الكتابة ───────────────────────────── */

const DELETE_FIELD = { [MZ]: "deleteField" } as const;
const SERVER_TIMESTAMP = { [MZ]: "serverTimestamp" } as const;

export const deleteField = (() => DELETE_FIELD) as unknown as typeof fs.deleteField;
export const serverTimestamp = (() => SERVER_TIMESTAMP) as unknown as typeof fs.serverTimestamp;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** للكتابة في Firestore: علاماتنا ← علامات Firestore الحقيقية (باقي الأنواع كما هي) */
function toFirestoreValue(v: unknown): unknown {
  if (v === DELETE_FIELD) return fs.deleteField();
  if (v === SERVER_TIMESTAMP) return fs.serverTimestamp();
  if (Array.isArray(v)) return v.map(toFirestoreValue);
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFirestoreValue(x)]));
  return v;
}

/**
 * للكتابة في MySQL: يرجع [البيانات, الحقول المحذوفة]. deleteField يصير مسار في deletes
 * (بمسارات متداخلة لو $nested — set مع merge)، والتواريخ نصوص ISO.
 */
function toStoreData(data: Record<string, unknown>, nested: boolean): [Record<string, unknown>, string[]] {
  const deletes: string[] = [];
  const walk = (v: unknown, path: string, top: boolean): unknown => {
    if (v === DELETE_FIELD) {
      if (!top && !nested) throw new Error("deleteField مسموح فقط على مستوى الحقل.");
      deletes.push(path);
      return undefined;
    }
    if (v === SERVER_TIMESTAMP) return new Date().toISOString();
    if (v instanceof Date) return v.toISOString();
    if (v instanceof fs.Timestamp) return v.toDate().toISOString();
    if (v instanceof fs.FieldValue) throw new Error("هذه العملية (increment/arrayUnion…) غير مدعومة على بيانات MySQL بعد.");
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}.${i}`, false));
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const r = walk(x, path ? `${path}.${k}` : k, false);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    if (v !== null && typeof v === "object") throw new Error("نوع قيمة غير مدعوم على بيانات MySQL.");
    return v;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const r = walk(v, k, true);
    if (r !== undefined) out[k] = r;
  }
  return [out, deletes];
}

type WriteOp =
  | { op: "set"; path: string; data: Record<string, unknown>; merge?: boolean; deletes?: string[] }
  | { op: "create"; path: string; data: Record<string, unknown> }
  | { op: "update"; path: string; data: Record<string, unknown>; deletes: string[] }
  | { op: "delete"; path: string };

function setOp(ref: MzDocRef, data: any, options?: fs.SetOptions): WriteOp {
  if (options && "mergeFields" in options) throw new Error("mergeFields غير مدعوم على بيانات MySQL.");
  const merge = !!(options && "merge" in options && options.merge);
  const [d, deletes] = toStoreData(data, merge);
  return { op: "set", path: ref.path, data: d, merge, deletes };
}

/** updateDoc(ref, {a: 1}) أو updateDoc(ref, "a", 1, "b", 2) */
function updateOp(ref: MzDocRef, args: any[]): WriteOp {
  let data: Record<string, unknown>;
  if (typeof args[0] === "string") {
    data = {};
    for (let i = 0; i < args.length; i += 2) data[args[i]] = args[i + 1];
  } else {
    data = args[0];
  }
  const [d, deletes] = toStoreData(data, false);
  return { op: "update", path: ref.path, data: d, deletes };
}

const writeOps = (ops: WriteOp[]) => call<{ ok: true }>("data/write", { ops });

export const setDoc = (async (ref: any, data: any, options?: fs.SetOptions) => {
  if (mzKind(ref) !== "document") return options ? fs.setDoc(ref, toFirestoreValue(data) as any, options) : fs.setDoc(ref, toFirestoreValue(data) as any);
  await writeOps([setOp(ref, data, options)]);
}) as typeof fs.setDoc;

export const updateDoc = (async (ref: any, ...args: any[]) => {
  if (mzKind(ref) !== "document") return (fs.updateDoc as any)(ref, ...args.map(toFirestoreValue));
  await writeOps([updateOp(ref, args)]);
}) as typeof fs.updateDoc;

export const deleteDoc = (async (ref: any) => {
  if (mzKind(ref) !== "document") return fs.deleteDoc(ref);
  await writeOps([{ op: "delete", path: ref.path }]);
}) as typeof fs.deleteDoc;

export const addDoc = (async (coll: any, data: any) => {
  if (mzKind(coll) !== "collection") return fs.addDoc(coll, toFirestoreValue(data) as any);
  const ref = makeDocRef(coll.firestore, `${coll.path}/${autoId()}`);
  await writeOps([{ op: "create", path: ref.path, data: toStoreData(data, false)[0] }]);
  return ref;
}) as unknown as typeof fs.addDoc;

/** writeBatch: عمليات MySQL في دفعة ذرّية، وعمليات Firestore في دفعة Firestore */
export const writeBatch = ((db: fs.Firestore) => {
  const ours: WriteOp[] = [];
  let real: fs.WriteBatch | null = null;
  const realBatch = () => (real ??= fs.writeBatch(db));
  const batch = {
    set(ref: any, data: any, options?: fs.SetOptions) {
      if (mzKind(ref) === "document") ours.push(setOp(ref, data, options));
      else if (options) realBatch().set(ref, toFirestoreValue(data) as any, options);
      else realBatch().set(ref, toFirestoreValue(data) as any);
      return batch;
    },
    update(ref: any, ...args: any[]) {
      if (mzKind(ref) === "document") ours.push(updateOp(ref, args));
      else (realBatch().update as any)(ref, ...args.map(toFirestoreValue));
      return batch;
    },
    delete(ref: any) {
      if (mzKind(ref) === "document") ours.push({ op: "delete", path: ref.path });
      else realBatch().delete(ref);
      return batch;
    },
    async commit() {
      if (ours.length) await writeOps(ours);
      if (real) await real.commit();
    },
  };
  return batch;
}) as unknown as typeof fs.writeBatch;
