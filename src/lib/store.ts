/**
 * طبقة البيانات — نفس واجهة دوال Firestore اللي يستخدمها التطبيق، لكن كل شي يروح لـ MySQL
 * عبر /api/v1/data (public/api/_lib/store.php) والسيرفر يطبّق الصلاحيات.
 *
 * تاريخياً كانت بديلاً لـ "firebase/firestore" أثناء التحويل على مراحل؛ بعد إزالة Firebase
 * صارت مستقلة تماماً (ما في مكتبة Firebase في الواجهة). الفروق عن Firestore:
 *   - onSnapshot = جلب دوري كل 20 ثانية (يبلّغ بس لو تغيّرت البيانات)
 *   - serverTimestamp() = وقت الجهاز بصيغة ISO (والسيرفر يضع الوقت بنفسه حيث يهم)
 *   - التواريخ نصوص ISO — اقرأها بـ toDate/toMillis من ./dates
 *   - قيود الاستعلام المدعومة: where (مع and/or) و orderBy و limit
 */

import { apiRequest, ApiError } from "./authApi";

const MZ = Symbol.for("mawazzen.store");
const PAGE_SIZE = 500;
/** كل كم ثانية نعيد الجلب لمحاكاة التحديث الفوري */
const POLL_MS = 20_000;

/* ───────────────────────────── الأنواع ───────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentData = { [field: string]: any };

/** مقبض قاعدة البيانات (src/lib/firebase.ts: db) — للتوافق مع توقيع collection(db, ...) */
export interface Firestore {
  readonly type: "firestore";
}

/** مرجع مجموعة = استعلام بلا شروط (مثل Firestore: CollectionReference يمتد من Query) */
export interface CollectionReference<T = DocumentData> extends Query<T> {
  readonly [MZ]: "collection";
  readonly type: "collection";
  readonly id: string;
  readonly path: string;
  readonly parent: DocumentReference | null;
}

export interface DocumentReference<T = DocumentData> {
  readonly [MZ]: "document";
  readonly type: "document";
  readonly id: string;
  readonly path: string;
  readonly parent: CollectionReference<T>;
  readonly firestore: Firestore;
}

type WhereClause = [string, string, unknown];
type OrderClause = [string, "asc" | "desc"];
/** شرط بصيغة السيرفر: [field, op, value] أو {or: [...]} / {and: [...]} */
type ServerPredicate = WhereClause | { or: ServerPredicate[] } | { and: ServerPredicate[] };

export interface Query<T = DocumentData> {
  readonly [MZ]: "query" | "collection";
  readonly type: "query" | "collection";
  readonly firestore: Firestore;
  readonly source: { path: string } | { group: string };
  readonly where: ServerPredicate[];
  readonly orderBy: OrderClause[];
  readonly limit?: number;
  readonly __t?: T;
}

export interface QueryConstraint {
  readonly [MZ]: "constraint";
  readonly kind: "where" | "orderBy" | "limit" | "and" | "or";
  /** مثل خاصية type في قيود Firestore — كود مثل visibleCasesQuery يفرز بها */
  readonly type: "where" | "orderBy" | "limit" | "and" | "or";
  readonly args: unknown[];
}
export type QueryFieldFilterConstraint = QueryConstraint;
export type QueryCompositeFilterConstraint = QueryConstraint;
export type QueryNonFilterConstraint = QueryConstraint;

export interface DocumentSnapshot<T = DocumentData> {
  readonly id: string;
  readonly ref: DocumentReference<T>;
  exists(): boolean;
  data(): T | undefined;
  get(field: string): unknown;
}

export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  data(): T;
}

export interface QuerySnapshot<T = DocumentData> {
  readonly docs: QueryDocumentSnapshot<T>[];
  readonly size: number;
  readonly empty: boolean;
  forEach(cb: (d: QueryDocumentSnapshot<T>) => void, thisArg?: unknown): void;
  docChanges(): { type: "added"; doc: QueryDocumentSnapshot<T>; oldIndex: number; newIndex: number }[];
}

export type SetOptions = { merge?: boolean };

/* ───────────────────────────── المراجع ───────────────────────────── */

const mzKind = (x: unknown): string | undefined =>
  x !== null && typeof x === "object" ? (x as Record<symbol, string>)[MZ] : undefined;

const trimPath = (p: string) => p.replace(/^\/+|\/+$/g, "");

function makeCollectionRef(db: Firestore, path: string): CollectionReference {
  const segs = trimPath(path).split("/");
  return {
    [MZ]: "collection",
    type: "collection",
    id: segs[segs.length - 1],
    path: segs.join("/"),
    get parent() { return segs.length > 1 ? makeDocRef(db, segs.slice(0, -1).join("/")) : null; },
    firestore: db,
    source: { path: segs.join("/") },
    where: [],
    orderBy: [],
  };
}

function makeDocRef(db: Firestore, path: string): DocumentReference {
  const segs = trimPath(path).split("/");
  return {
    [MZ]: "document",
    type: "document",
    id: segs[segs.length - 1],
    path: segs.join("/"),
    get parent() { return makeCollectionRef(db, segs.slice(0, -1).join("/")); },
    firestore: db,
  };
}

/** معرّف بنفس شكل معرّفات Firestore التلقائية (20 حرف) */
function autoId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** مسار كامل ومقبض القاعدة من (db | مرجع, ...أجزاء) */
function resolve(parent: Firestore | DocumentReference | CollectionReference, segments: string[]): { db: Firestore; full: string } {
  const rel = segments.filter((s) => s !== undefined).join("/");
  if (parent.type === "document" || parent.type === "collection") {
    return { db: parent.firestore, full: trimPath(`${parent.path}/${rel}`) };
  }
  return { db: parent, full: trimPath(rel) };
}

export function collection(parent: Firestore | DocumentReference | CollectionReference, path: string, ...rest: string[]): CollectionReference {
  const { db, full } = resolve(parent, [path, ...rest]);
  return makeCollectionRef(db, full);
}

export function doc(parent: Firestore | DocumentReference | CollectionReference, path?: string, ...rest: string[]): DocumentReference {
  // doc(collectionRef) — معرّف تلقائي
  if (path === undefined && parent.type === "collection") return makeDocRef(parent.firestore, `${parent.path}/${autoId()}`);
  const { db, full } = resolve(parent, [path as string, ...rest]);
  return makeDocRef(db, full);
}

export function collectionGroup(db: Firestore, id: string): Query {
  return { [MZ]: "query", type: "query", firestore: db, source: { group: id }, where: [], orderBy: [] };
}

/* ───────────────────────────── الاستعلامات ───────────────────────────── */

const constraint = (kind: QueryConstraint["kind"], args: unknown[]): QueryConstraint =>
  ({ [MZ]: "constraint", kind, type: kind, args });

export const where = (field: string, op: string, value: unknown) => constraint("where", [field, op, value]);
export const orderBy = (field: string, dir: "asc" | "desc" = "asc") => constraint("orderBy", [field, dir]);
export const limit = (n: number) => constraint("limit", [n]);
export const and = (...filters: QueryConstraint[]) => constraint("and", filters);
export const or = (...filters: QueryConstraint[]) => constraint("or", filters);

/** قيد where/and/or ← صيغة السيرفر */
function toPredicate(c: QueryConstraint): ServerPredicate {
  if (mzKind(c) !== "constraint") throw new Error("شرط غير مدعوم (المدعوم: where وand وor).");
  if (c.kind === "where") return c.args as WhereClause;
  if (c.kind === "and") return { and: (c.args as QueryConstraint[]).map(toPredicate) };
  if (c.kind === "or") return { or: (c.args as QueryConstraint[]).map(toPredicate) };
  throw new Error("شرط غير مدعوم داخل and/or.");
}

/** مرجع المجموعة يحمل نفس حقول الاستعلام — نوحّده لاستعلام */
const asQuery = (x: CollectionReference | Query): Query =>
  ({ [MZ]: "query", type: "query", firestore: x.firestore, source: x.source, where: x.where, orderBy: x.orderBy, limit: x.limit });

export function query<T = DocumentData>(base: CollectionReference<T> | Query<T>, ...constraints: (QueryConstraint | QueryConstraint[])[]): Query<T> {
  const b = asQuery(base as CollectionReference | Query);
  const where: ServerPredicate[] = [...b.where];
  const order: OrderClause[] = [...b.orderBy];
  let lim = b.limit;
  for (const c of constraints.flat()) {
    if (mzKind(c) !== "constraint") throw new Error("قيد استعلام غير مدعوم (المدعوم: where وorderBy وlimit وand/or).");
    if (c.kind === "orderBy") order.push(c.args as OrderClause);
    else if (c.kind === "limit") lim = c.args[0] as number;
    else if (c.kind === "and") where.push(...(c.args as QueryConstraint[]).map(toPredicate)); // and أعلى = شروط عادية
    else where.push(toPredicate(c));
  }
  return { ...b, where, orderBy: order, limit: lim } as Query<T>;
}

/* ───────────────────────────── الأخطاء ───────────────────────────── */

/** نفس شكل أخطاء Firestore (err.code) عشان معالجات الأخطاء الموجودة تشتغل */
class StoreError extends Error {
  name = "FirebaseError";
  constructor(readonly code: string, message: string) { super(message); }
}

const CODE_MAP: Record<number, string> = {
  0: "unavailable", 400: "invalid-argument", 401: "unauthenticated", 403: "permission-denied",
  404: "not-found", 409: "already-exists", 413: "resource-exhausted", 422: "invalid-argument", 429: "resource-exhausted",
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

interface RawDoc { path: string; id: string; data?: DocumentData }

function getField(data: unknown, field: string): unknown {
  return field.split(".").reduce<unknown>((v, k) => (v !== null && typeof v === "object" ? (v as DocumentData)[k] : undefined), data);
}

function makeDocSnapshot(db: Firestore, path: string, data: DocumentData | undefined): QueryDocumentSnapshot {
  const ref = makeDocRef(db, path);
  return {
    id: ref.id,
    ref,
    exists: () => data !== undefined,
    // نسخة جديدة كل مرة — مثل Firestore، تعديلها ما يأثر على اللقطة
    data: () => (data === undefined ? undefined : structuredClone(data)) as DocumentData,
    get: (field: string) => getField(data, field),
  };
}

function makeQuerySnapshot(db: Firestore, rows: RawDoc[]): QuerySnapshot {
  const docs = rows.map((r) => makeDocSnapshot(db, r.path, r.data ?? {}));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb, thisArg) => docs.forEach(cb, thisArg),
    docChanges: () => docs.map((d, i) => ({ type: "added" as const, doc: d, oldIndex: -1, newIndex: i })),
  };
}

const queryRequest = (q: Query) => ({ ...q.source, where: q.where, orderBy: q.orderBy });

/** يجيب كل النتائج (أو حتى limit) صفحة صفحة — السيرفر يحد الصفحة بـ 1000 */
async function runQuery(q: Query): Promise<RawDoc[]> {
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

export async function getDocs<T = DocumentData>(q: CollectionReference<T> | Query<T>): Promise<QuerySnapshot<T>> {
  const mq = asQuery(q as CollectionReference | Query);
  return makeQuerySnapshot(mq.firestore, await runQuery(mq)) as unknown as QuerySnapshot<T>;
}

export async function getDoc<T = DocumentData>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  const res = await call<RawDoc & { exists: boolean }>("data/get", { path: ref.path });
  return makeDocSnapshot(ref.firestore, ref.path, res.exists ? res.data ?? {} : undefined) as unknown as DocumentSnapshot<T>;
}

export async function getCountFromServer(q: CollectionReference | Query): Promise<{ data(): { count: number } }> {
  const { count } = await call<{ count: number }>("data/count", queryRequest(asQuery(q)));
  return { data: () => ({ count }) };
}

type SnapshotObserver<S> = { next?: (snap: S) => void; error?: (err: Error) => void };

/**
 * onSnapshot = جلب دوري: كل 20 ثانية، ويبلّغ المستمع بس لو تغيّرت البيانات.
 * التبويب المخفي ما يرسل طلبات، ويجلب فوراً لما يرجع المستخدم له.
 */
export function onSnapshot<T = DocumentData>(target: DocumentReference<T>, next: (snap: DocumentSnapshot<T>) => void, error?: (err: Error) => void): () => void;
export function onSnapshot<T = DocumentData>(target: CollectionReference<T> | Query<T>, next: (snap: QuerySnapshot<T>) => void, error?: (err: Error) => void): () => void;
export function onSnapshot(target: DocumentReference | CollectionReference | Query, ...args: unknown[]): () => void {
  const isDoc = mzKind(target) === "document";
  const observer: SnapshotObserver<unknown> = typeof args[0] === "function"
    ? { next: args[0] as (s: unknown) => void, error: args[1] as ((e: Error) => void) | undefined }
    : (args[0] as SnapshotObserver<unknown>) ?? {};
  let active = true;
  let last = "";
  let inFlight = false;

  const poll = () => {
    if (!active || inFlight) return;
    if (typeof document !== "undefined" && document.hidden && last !== "") return;
    inFlight = true;
    (isDoc ? getDoc(target as DocumentReference) : getDocs(target as Query))
      .then((snap) => {
        if (!active) return;
        const key = JSON.stringify(isDoc
          ? (snap as DocumentSnapshot).data() ?? null
          : (snap as QuerySnapshot).docs.map((d) => [d.ref.path, d.data()]));
        if (key === last) return;
        last = key;
        observer.next?.(snap);
      })
      .catch((err: Error) => { if (active) observer.error?.(err); })
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
}

/* ───────────────────────────── الكتابة ───────────────────────────── */

const DELETE_FIELD = { [MZ]: "deleteField" } as const;
const SERVER_TIMESTAMP = { [MZ]: "serverTimestamp" } as const;

/** علامة حذف حقل (مثل deleteField في Firestore) */
export const deleteField = (): unknown => DELETE_FIELD;
/** وقت الجهاز بصيغة ISO (السيرفر يضع الوقت بنفسه في المجموعات اللي يهمها) */
export const serverTimestamp = (): unknown => SERVER_TIMESTAMP;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * للكتابة: يرجع [البيانات, الحقول المحذوفة]. deleteField يصير مسار في deletes
 * (بمسارات متداخلة لو $nested — set مع merge)، والتواريخ نصوص ISO.
 */
function toStoreData(data: DocumentData, nested: boolean): [DocumentData, string[]] {
  const deletes: string[] = [];
  const walk = (v: unknown, path: string, top: boolean): unknown => {
    if (v === DELETE_FIELD) {
      if (!top && !nested) throw new Error("deleteField مسموح فقط على مستوى الحقل.");
      deletes.push(path);
      return undefined;
    }
    if (v === SERVER_TIMESTAMP) return new Date().toISOString();
    if (v instanceof Date) return v.toISOString();
    if (v && typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
      return (v as { toDate(): Date }).toDate().toISOString(); // Timestamp قديم محفوظ في الذاكرة
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}.${i}`, false));
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const r = walk(x, path ? `${path}.${k}` : k, false);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    if (v !== null && typeof v === "object") throw new Error("نوع قيمة غير مدعوم.");
    return v;
  };
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    const r = walk(v, k, true);
    if (r !== undefined) out[k] = r;
  }
  return [out, deletes];
}

type WriteOp =
  | { op: "set"; path: string; data: DocumentData; merge?: boolean; deletes?: string[] }
  | { op: "create"; path: string; data: DocumentData }
  | { op: "update"; path: string; data: DocumentData; deletes: string[] }
  | { op: "delete"; path: string };

function setOp(ref: DocumentReference, data: DocumentData, options?: SetOptions): WriteOp {
  const merge = !!options?.merge;
  const [d, deletes] = toStoreData(data, merge);
  return { op: "set", path: ref.path, data: d, merge, deletes };
}

/** updateDoc(ref, {a: 1}) أو updateDoc(ref, "a", 1, "b", 2) */
function updateOp(ref: DocumentReference, args: unknown[]): WriteOp {
  let data: DocumentData;
  if (typeof args[0] === "string") {
    data = {};
    for (let i = 0; i < args.length; i += 2) data[args[i] as string] = args[i + 1];
  } else {
    data = args[0] as DocumentData;
  }
  const [d, deletes] = toStoreData(data, false);
  return { op: "update", path: ref.path, data: d, deletes };
}

const writeOps = (ops: WriteOp[]) => call<{ ok: true }>("data/write", { ops });

export async function setDoc(ref: DocumentReference, data: DocumentData, options?: SetOptions): Promise<void> {
  await writeOps([setOp(ref, data, options)]);
}

export async function updateDoc(ref: DocumentReference, ...args: unknown[]): Promise<void> {
  await writeOps([updateOp(ref, args)]);
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await writeOps([{ op: "delete", path: ref.path }]);
}

export async function addDoc(coll: CollectionReference, data: DocumentData): Promise<DocumentReference> {
  const ref = makeDocRef(coll.firestore, `${coll.path}/${autoId()}`);
  await writeOps([{ op: "create", path: ref.path, data: toStoreData(data, false)[0] }]);
  return ref;
}

export interface WriteBatch {
  set(ref: DocumentReference, data: DocumentData, options?: SetOptions): WriteBatch;
  update(ref: DocumentReference, ...args: unknown[]): WriteBatch;
  delete(ref: DocumentReference): WriteBatch;
  commit(): Promise<void>;
}

/** دفعة ذرّية: كل العمليات تنجح أو ولا وحدة */
export function writeBatch(_db: Firestore): WriteBatch {
  const ops: WriteOp[] = [];
  const batch: WriteBatch = {
    set(ref, data, options) { ops.push(setOp(ref, data, options)); return batch; },
    update(ref, ...args) { ops.push(updateOp(ref, args)); return batch; },
    delete(ref) { ops.push({ op: "delete", path: ref.path }); return batch; },
    async commit() { if (ops.length) await writeOps(ops); },
  };
  return batch;
}
