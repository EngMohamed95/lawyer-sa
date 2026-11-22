// خطاف تحميل لاختبار store_adapter_test.ts: يستبدل src/lib/firebase.ts بنسخة وهمية
// (firebase.ts يعتمد على import.meta.env اللي تعرّفه Vite فقط). المجموعات المنقولة
// ما تحتاج Firestore حقيقي، فـ db وهمي يكفي.
export async function resolve(specifier, context, next) {
  if (/(^|\/)firebase(\.ts)?$/.test(specifier) && context.parentURL?.includes("/src/lib/")) {
    return { url: new URL("./stub_firebase.mjs", import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
