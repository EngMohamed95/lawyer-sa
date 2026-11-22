// @ts-nocheck — اختبار وقت تشغيل يتعمد أشكال بيانات متغيرة (deleteField، استبدال المستند…)
// اللي أنواع Firestore العامة ما تسمح بها؛ الكود المختبَر نفسه (src/lib/store.ts) مفحوص بالكامل.
/**
 * اختبار src/lib/store.ts الحقيقي ضد PHP + MySQL حقيقيين (قاعدة الاختبار).
 *
 *   npx tsx database/tests/store_adapter_test.ts <مسار-إعداد-قاعدة-الاختبار>
 *
 * المجموعات اللي ما انتقلت ما تُلمس هنا (ما في اتصال بـ Firestore) — نتأكد بس إنها ما تتوجه لـ MySQL.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { register } from "node:module";
import path from "node:path";

register("./stub_firebase_hooks.mjs", import.meta.url);
const memory: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in memory ? memory[k] : null),
  setItem: (k: string, v: string) => { memory[k] = String(v); },
  removeItem: (k: string) => { delete memory[k]; },
};

const configPath = process.argv[2];
if (!configPath) { console.error("استخدم: npx tsx database/tests/store_adapter_test.ts <test-config.php>"); process.exit(2); }

const PORT = 8093;
const root = path.resolve(import.meta.dirname, "../..");

/* ─── بيئة المتصفح: fetch بعنوان كامل وجرة كوكيز (متصفح لكل مستخدم) ─── */
(globalThis as any).window = globalThis;
const realFetch = globalThis.fetch;
const jars: Record<string, string> = {};
let currentJar = "A";
globalThis.fetch = (async (input: any, init: any = {}) => {
  const headers = { ...(init.headers || {}), ...(jars[currentJar] ? { Cookie: jars[currentJar] } : {}) };
  const url = String(input).replace(/^\/api\/v1\/(.*)$/, `http://127.0.0.1:${PORT}/api/index.php?__route=$1`);
  const res = await realFetch(url, { ...init, headers });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).find((c) => c.startsWith("mz_session="));
  if (cookie) jars[currentJar] = cookie;
  return res;
}) as typeof fetch;

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`); }
}
async function rejects(p: Promise<unknown>): Promise<any> {
  try { await p; return null; } catch (e) { return e; }
}

const server = spawn("php", [path.join(root, "database/tests/adapter_server.php"), configPath, String(PORT)], { cwd: root, stdio: ["pipe", "pipe", "inherit"] });
let ready = "";
server.stdout.on("data", (b) => { ready += b; });
for (let i = 0; i < 100 && !ready.includes("READY"); i++) await new Promise((r) => setTimeout(r, 100));
if (!ready.includes("READY")) { console.error("خادم الاختبار ما اشتغل"); process.exit(1); }

try {
  const { apiRequest } = await import("../../src/lib/authApi");
  const store = await import("../../src/lib/store");
  const { collection, doc, query, where, orderBy, limit, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
    deleteField, writeBatch, getCountFromServer, collectionGroup, serverTimestamp, and, or } = store;
  const db = { type: "firestore" } as any; // ما نحتاج Firestore حقيقي للمجموعات المنقولة

  for (const [jar, email] of [["A", "a@t.l"], ["B", "b@t.l"]]) {
    currentJar = jar;
    await apiRequest("POST", "auth/login", { email, password: "secret123", rememberMe: true });
  }
  currentJar = "A";

  console.log("التوجيه");
  const cases = collection(db, "cases") as any;
  check("cases ← MySQL", cases[Symbol.for("mawazzen.store")] === "collection");
  check("مسار مجموعة فرعية", (collection(db, "cases", "x", "hearings") as any).path === "cases/x/hearings");
  check("doc(collection) يولّد معرّف 20 حرف", (doc(cases) as any).id.length === 20);
  check("doc(db, 'cases/abc') بمسار واحد", (doc(db, "cases/abc") as any).path === "cases/abc");

  console.log("القراءة والكتابة");
  const ref = await addDoc(cases, { lawyerId: "ownerA", title: "قضية", createdAt: new Date("2026-01-02T03:04:05Z"), meta: { a: 1 }, empty: {} });
  const snap = await getDoc(ref);
  check("addDoc ثم getDoc", snap.exists() && snap.data()!.title === "قضية" && snap.id === ref.id);
  check("Date ← نص ISO", snap.data()!.createdAt === "2026-01-02T03:04:05.000Z", snap.data());
  check("الخريطة الفاضية تظل كائن", JSON.stringify(snap.data()!.empty) === "{}");
  check("snap.get بمسار متداخل", snap.get("meta.a") === 1);
  const copy = snap.data()!; copy.title = "تعديل محلي";
  check("data() يرجع نسخة (تعديلها ما يأثر)", snap.data()!.title === "قضية");

  await updateDoc(ref, { "meta.b": 2, title: deleteField(), stamp: serverTimestamp() });
  let d = (await getDoc(ref)).data()!;
  check("updateDoc: مسار متداخل + deleteField + serverTimestamp", d.meta.a === 1 && d.meta.b === 2 && !("title" in d) && typeof d.stamp === "string", d);
  await updateDoc(ref, "status", "OPEN", "priority", 3);
  d = (await getDoc(ref)).data()!;
  check("updateDoc بالصيغة المتغيرة (field, value, …)", d.status === "OPEN" && d.priority === 3, d);
  await setDoc(ref, { meta: { c: 3, a: deleteField() } }, { merge: true });
  d = (await getDoc(ref)).data()!;
  check("setDoc merge + deleteField متداخل", d.meta.c === 3 && d.meta.b === 2 && !("a" in d.meta), d.meta);
  await setDoc(ref, { lawyerId: "ownerA", only: true });
  d = (await getDoc(ref)).data()!;
  check("setDoc بدون merge يستبدل", Object.keys(d).sort().join() === "lawyerId,only", d);

  const eMissing: any = await rejects(getDoc(doc(db, "cases", "nope")));
  check("getDoc لقضية غير موجودة ← permission-denied (مثل Firestore)", eMissing?.code === "permission-denied", eMissing?.code);
  const missingChild = await getDoc(doc(db, "cases", ref.id, "hearings", "nope"));
  check("getDoc لمستند فرعي غير موجود ← exists() = false", missingChild.exists() === false && missingChild.data() === undefined);
  const e404: any = await rejects(updateDoc(doc(db, "cases", ref.id, "hearings", "nope"), { a: 1 }));
  check("updateDoc لمستند فرعي غير موجود ← not-found", e404?.code === "not-found", e404?.code);

  console.log("المجموعات الفرعية و collectionGroup");
  const hRef = await addDoc(collection(db, "cases", ref.id, "hearings"), { date: "2026-12-01" });
  const hSnap = await getDoc(hRef);
  check("ref.parent.parent = القضية", hSnap.ref.parent.parent?.id === ref.id && hSnap.ref.parent.parent?.path === `cases/${ref.id}`);
  check("المستند الفرعي ورث lawyerId", hSnap.data()!.lawyerId === "ownerA");
  await setDoc(doc(db, "clients", "cl1"), { lawyerId: "ownerA", name: "عميل" });
  await addDoc(collection(db, "clients", "cl1", "documents"), { name: "عقد" });
  await addDoc(collection(db, "cases", ref.id, "documents"), { name: "مذكرة" });
  const docsSnap = await getDocs(query(collectionGroup(db, "documents"), where("lawyerId", "==", "ownerA")));
  const parents = docsSnap.docs.map((x) => x.ref.parent.parent?.path.split("/")[0]).sort();
  check("collectionGroup documents عبر القضايا والعملاء", docsSnap.size === 2 && parents.join() === "cases,clients", parents);

  console.log("الاستعلامات والصفحات");
  const tasks = collection(db, "tasks");
  for (let b = 0; b < 3; b++) {
    const batch = writeBatch(db);
    for (let i = 0; i < 400; i++) {
      const n = b * 400 + i;
      batch.set(doc(tasks), { lawyerId: "ownerA", n, status: n % 2 ? "open" : "done" });
    }
    await batch.commit();
  }
  const all = await getDocs(tasks);
  check("getDocs بدون limit يجيب كل الصفحات (1200)", all.size === 1200, all.size);
  const open = await getDocs(query(tasks, where("status", "==", "open"), orderBy("n", "desc"), limit(3)));
  check("where + orderBy desc + limit", open.docs.map((x) => x.data().n).join() === "1199,1197,1195", open.docs.map((x) => x.data().n));
  const big = await getDocs(query(tasks, orderBy("n"), limit(700)));
  check("limit أكبر من صفحة وحدة (700)", big.size === 700 && big.docs[699].data().n === 699, big.size);
  const cnt = await getCountFromServer(query(tasks, where("status", "==", "done")));
  check("getCountFromServer", cnt.data().count === 600, cnt.data());
  let forEachCount = 0; open.forEach(() => forEachCount++);
  check("snapshot.forEach و empty", forEachCount === 3 && open.empty === false);

  console.log("visibleCasesQuery الحقيقية (and/or) — تستخدمها 15 صفحة");
  const { visibleCasesQuery } = await import("../../src/lib/caseAccess");
  await setDoc(doc(db, "cases", "vc1"), { lawyerId: "ownerA", assignedLawyerIds: ["law1"] });
  await setDoc(doc(db, "cases", "vc2"), { lawyerId: "ownerA", assignedLawyerId: "law1" });
  await setDoc(doc(db, "cases", "vc3"), { lawyerId: "ownerA", assignedLawyerIds: ["other"] });
  memory.userRole = "LAWYER"; memory.userId = "ownerA";
  const allVisible = await getDocs(visibleCasesQuery("ownerA", limit(100)));
  check("مالك المكتب: كل القضايا عبر and()", ["vc1", "vc2", "vc3"].every((id) => allVisible.docs.some((x) => x.id === id)), allVisible.size);
  memory.userRole = "OFFICE_LAWYER"; memory.userId = "law1";
  const mine = await getDocs(visibleCasesQuery("ownerA"));
  check("فلتر or() للتكليف (القائمة الجديدة والحقل القديم)", mine.docs.map((x) => x.id).sort().join() === "vc1,vc2", mine.docs.map((x) => x.id));
  const counted = await getCountFromServer(query(collection(db, "cases"), or(where("assignedLawyerId", "==", "law1"), and(where("lawyerId", "==", "ownerA"), where("assignedLawyerIds", "array-contains", "other")))));
  check("or() فيه and() متداخل + العدّ", counted.data().count === 2, counted.data());
  memory.userRole = "LAWYER"; memory.userId = "ownerA"; memory.lawyerId = "ownerA";
  const { childrenOf, parentIdOf, assignedDocuments } = await import("../../src/lib/caseAccess");
  await setDoc(doc(db, "cases", "vc1", "hearings", "hv1"), { hearingDate: "2026-12-01" });
  await setDoc(doc(db, "cases", "vc2", "hearings", "hv2"), { hearingDate: "2026-12-02" });
  await setDoc(doc(db, "cases", "vc3", "requests", "rq1"), { type: "x" });
  await setDoc(doc(db, "cases", "vc1", "documents", "dv1"), { name: "a" });
  await setDoc(doc(db, "clients", "cl1", "documents", "dc1"), { name: "b" });
  const hv = await childrenOf("hearings", "ownerA", ["cases/vc1", "cases/vc2"]);
  check("childrenOf: جلسات قضايا محددة باستعلام واحد", hv.map((d) => `${parentIdOf(d)}/${d.id}`).sort().join() === "vc1/hv1,vc2/hv2", hv.map((d) => d.ref.path));
  const onlyOne = await childrenOf("hearings", "ownerA", ["cases/vc2"]);
  check("childrenOf يرجع فقط أبناء القضايا المطلوبة", onlyOne.map((d) => d.id).join() === "hv2");
  const rq = await childrenOf("requests", "ownerA", ["cases/vc3"]);
  check("childrenOf للطلبات (requests)", rq.map((d) => d.id).join() === "rq1");
  const ad = await assignedDocuments([{ id: "vc1", clientId: "cl1" }]);
  const adPaths = ad.map((d) => d.ref.path);
  check("assignedDocuments: مستندات القضية والعميل باستعلام واحد (وما غيرها)",
    adPaths.includes("cases/vc1/documents/dv1") && adPaths.includes("clients/cl1/documents/dc1")
      && adPaths.every((p) => p.startsWith("cases/vc1/") || p.startsWith("clients/cl1/")), adPaths);
  const realTyped = where("lawyerId", "==", "x") as any;
  check("القيد يحمل type مثل Firestore", realTyped.type === "where");

  console.log("onSnapshot (جلب دوري)");
  const calls: number[] = [];
  const unsub = store.onSnapshot(query(collection(db, "tasks"), where("status", "==", "open"), limit(2)), (snap: any) => calls.push(snap.size));
  await new Promise((r) => setTimeout(r, 1500));
  unsub();
  check("onSnapshot يرسل اللقطة الأولى (ومرة وحدة بس لو ما تغيّر شي)", calls.length === 1 && calls[0] === 2, calls);
  let afterUnsub = calls.length;
  await new Promise((r) => setTimeout(r, 300));
  check("بعد الإلغاء ما يجي شي", calls.length === afterUnsub);

  console.log("الدفعات والصلاحيات");
  const bad = writeBatch(db);
  bad.set(doc(db, "tasks", "ok1"), { lawyerId: "ownerA" });
  bad.set(doc(db, "tasks", "bad1"), { lawyerId: "ownerB" });
  const eBatch: any = await rejects(bad.commit());
  const tasksAfter = await getDocs(query(collection(db, "tasks"), where("lawyerId", "==", "ownerA")));
  check("دفعة فيها عملية مرفوضة ← permission-denied وما ينكتب شي",
    eBatch?.code === "permission-denied" && !tasksAfter.docs.some((x) => x.id === "ok1"), eBatch?.code);
  currentJar = "B";
  const eRead: any = await rejects(getDoc(ref));
  check("مكتب ثاني ← permission-denied (نفس كود Firestore)", eRead?.code === "permission-denied", eRead?.code);
  const bTasks = await getDocs(collection(db, "tasks"));
  check("مكتب ثاني يشوف صفر مهام", bTasks.size === 0, bTasks.size);
  currentJar = "A";
  await deleteDoc(ref);
  const eGone: any = await rejects(getDoc(ref));
  const hearingsLeft = await getDocs(query(collectionGroup(db, "documents"), where("lawyerId", "==", "ownerA")));
  check("deleteDoc: القضية راحت (القراءة مرفوضة مثل Firestore)", eGone?.code === "permission-denied", eGone?.code);
  check("… ومستنداتها الفرعية انحذفت معها", hearingsLeft.docs.every((x) => !x.ref.path.startsWith(`cases/${ref.id}/`)));
  const eUnsupported: any = await rejects(updateDoc(doc(db, "tasks", "x"), { n: store.increment(1) }));
  check("increment على MySQL ← خطأ واضح بدل كتابة غلط", /غير مدعومة/.test(eUnsupported?.message ?? ""), eUnsupported?.message);
} finally {
  server.stdin.end();
  await once(server, "exit").catch(() => {});
}

console.log(`\nالنتيجة: ${passed} نجح، ${failed} فشل`);
process.exit(failed === 0 ? 0 : 1);
