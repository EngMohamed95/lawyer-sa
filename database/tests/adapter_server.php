<?php
/**
 * خادم اختبار لـ store_adapter_test.ts: يجهّز قاعدة الاختبار ومستخدمين، يطبع READY،
 * ويظل شغال لين يقفل المستدعي stdin.
 */

declare(strict_types=1);

require __DIR__ . '/_harness.php';

$pdo = harness_start($argv[1] ?? '', (int) ($argv[2] ?? 8093));
harness_user($pdo, 'ownerA', 'a@t.l', 'LAWYER', null);
harness_user($pdo, 'ownerB', 'b@t.l', 'LAWYER', null);
echo "READY\n";
fflush(STDOUT);
while (!feof(STDIN)) { fgets(STDIN); }
