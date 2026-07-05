import { createPrivateKey } from 'crypto';
import fs from 'fs';

try {
  // قراءة المفتاح الحالي
  const privateKeyData = fs.readFileSync('FINAL_PRIVATE_KEY.pem', 'utf8');
  
  // تحميل المفتاح
  const key = createPrivateKey({
    key: privateKeyData,
    format: 'pem',
    type: 'pkcs1'
  });

  // إعادة تصديره بالصيغة الكلاسيكية التي يدعمها GitHub Actions
  const classicPem = key.export({
    type: 'pkcs1',
    format: 'pem'
  });

  // حفظه في ملف جديد
  fs.writeFileSync('CLASSIC_PRIVATE_KEY.pem', classicPem);
  console.log("تم تحويل المفتاح بنجاح! افتح ملف CLASSIC_PRIVATE_KEY.pem");
} catch (error) {
  console.error("حدث خطأ أثناء التحويل:", error.message);
}
