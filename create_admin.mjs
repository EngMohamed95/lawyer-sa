import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

const serviceAccount = JSON.parse(
  await readFile(new URL('./serviceAccountKey.json', import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function createSuperAdmin() {
  const email = 'admin@lawyeros.com';
  const password = 'LawyerOS_SuperAdmin_2026!#'; // Strong Password
  const name = 'المدير العام';

  try {
    // 1. Create User in Firebase Auth
    let userRecord;
    try {
        userRecord = await auth.getUserByEmail(email);
        console.log('User already exists in Auth, updating role...');
    } catch (e) {
        userRecord = await auth.createUser({
            email,
            password,
            displayName: name,
        });
        console.log('Successfully created new user in Auth:', userRecord.uid);
    }

    // 2. Create/Update User in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      name,
      email,
      role: 'SUPER_ADMIN',
      lawyerId: 'ALL', // Special ID for Super Admin
      createdAt: new Date().toISOString(),
      status: 'ACTIVE'
    }, { merge: true });

    console.log('--------------------------------------------------');
    console.log('✅ تم إنشاء حساب المدير العام بنجاح!');
    console.log('📧 البريد الإلكتروني:', email);
    console.log('🔑 كلمة المرور:', password);
    console.log('--------------------------------------------------');
    console.log('يرجى حفظ هذه البيانات في مكان آمن.');

  } catch (error) {
    console.error('Error creating super admin:', error);
  } finally {
      process.exit();
  }
}

createSuperAdmin();
