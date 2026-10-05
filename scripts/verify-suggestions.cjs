const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const testRequire = require('module').createRequire(require.resolve('@firebase/rules-unit-testing'));
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, serverTimestamp } = testRequire('firebase/firestore');
const fs = require('fs');

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-lawyer-suggestions', firestore: { host: '127.0.0.1', port: 8088, rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const owner = env.authenticatedContext('owner').firestore();
  const admin = env.authenticatedContext('admin').firestore();
  const other = env.authenticatedContext('other').firestore();
  const item = (database = owner, id = 'suggestion-test') => doc(database, 'productSuggestions', id);
  const data = () => ({ title: 'تحسين شاشة التقارير', details: 'إضافة مقارنة شهرية واضحة داخل شاشة التقارير.', category: 'الحسابات والتقارير', status: 'RECEIVED', createdBy: 'owner', requesterName: 'صاحب المكتب', lawyerId: 'office-a', adminResponse: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), respondedAt: null });
  let checks = 0;
  const pass = async (name, action) => { await action(); checks++; console.log(`PASS ${name}`); };
  try {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner'), { role: 'LAWYER', lawyerId: 'office-a', status: 'ACTIVE' });
      await setDoc(doc(context.firestore(), 'users', 'admin'), { role: 'SUPER_ADMIN', status: 'ACTIVE' });
      await setDoc(doc(context.firestore(), 'users', 'other'), { role: 'LAWYER', lawyerId: 'office-b', status: 'ACTIVE' });
    });
    await pass('owner creates suggestion', () => assertSucceeds(setDoc(item(), data())));
    await pass('owner reads own suggestion', () => assertSucceeds(getDoc(item())));
    await pass('admin reads suggestion', () => assertSucceeds(getDoc(item(admin))));
    await pass('another office cannot read', () => assertFails(getDoc(item(other))));
    await pass('owner scoped list succeeds', () => assertSucceeds(getDocs(query(collection(owner, 'productSuggestions'), where('createdBy', '==', 'owner')))));
    await pass('owner unscoped list denied', () => assertFails(getDocs(collection(owner, 'productSuggestions'))));
    await pass('cannot forge owner', () => assertFails(setDoc(item(owner, 'forged-owner'), { ...data(), createdBy: 'other' })));
    await pass('cannot forge tenant', () => assertFails(setDoc(item(owner, 'forged-office'), { ...data(), lawyerId: 'office-b' })));
    await pass('cannot create invalid category', () => assertFails(setDoc(item(owner, 'bad-category'), { ...data(), category: 'invalid' })));
    await pass('owner cannot change status', () => assertFails(updateDoc(item(), { status: 'IMPLEMENTED', updatedAt: serverTimestamp() })));
    await pass('owner cannot write admin response', () => assertFails(updateDoc(item(), { adminResponse: 'تم', updatedAt: serverTimestamp(), respondedAt: serverTimestamp() })));
    await pass('admin reviews and responds', () => assertSucceeds(updateDoc(item(admin), { status: 'PLANNED', adminResponse: 'تمت إضافته لخطة التطوير.', updatedAt: serverTimestamp(), respondedAt: serverTimestamp() })));
    await pass('immutable suggestion fields stay protected', () => assertFails(updateDoc(item(admin), { title: 'changed', updatedAt: serverTimestamp() })));
    await pass('suggestion cannot be deleted', () => assertFails(deleteDoc(item(admin))));
    console.log(`\n${checks} suggestion security checks passed.`);
  } finally { await env.cleanup(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
