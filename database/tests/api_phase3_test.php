<?php
/**
 * اختبار المرحلة 3: سياسات المجموعات الجديدة (المالية، إعدادات المكتب، البوابة، الإشعارات،
 * سجلات التدقيق) وعدّادات الترقيم (بما فيها طلبات متزامنة).
 *
 *   php database/tests/api_phase3_test.php <مسار-إعداد-قاعدة-الاختبار>
 */

declare(strict_types=1);

require __DIR__ . '/_harness.php';

$pdo = harness_start($argv[1] ?? '', 8095);
harness_user($pdo, 'ownerA', 'a@t.l', 'LAWYER', null);
harness_user($pdo, 'ownerB', 'b@t.l', 'LAWYER', null);
harness_user($pdo, 'ownerC', 'c@t.l', 'LAWYER', null, ['subscriptionBilling' => 'trial', 'trialEndsAt' => '2020-01-01T00:00:00Z']);
harness_user($pdo, 'secA', 'sa@t.l', 'SECRETARY', 'ownerA');
harness_user($pdo, 'lawyerA', 'la@t.l', 'OFFICE_LAWYER', 'ownerA');
harness_user($pdo, 'admin', 'ad@t.l', 'SUPER_ADMIN', 'ALL');
foreach (['a@t.l' => 'A', 'b@t.l' => 'B', 'c@t.l' => 'C', 'sa@t.l' => 'SA', 'la@t.l' => 'LA', 'ad@t.l' => 'AD'] as $e => $jar) login($e, $jar);

$write = fn(string $jar, array $ops) => call('POST', 'data/write', ['ops' => $ops], $jar);
$op = fn(string $type, string $path, array $data = []) => ['op' => $type, 'path' => $path] + ($type === 'delete' ? [] : ['data' => $data]);
$one = fn(string $jar, string $type, string $path, array $data = []) => $write($jar, [$op($type, $path, $data)])[0];
$get = fn(string $jar, string $path) => call('POST', 'data/get', ['path' => $path], $jar);
$ids = fn(string $jar, string $path) => array_column(call('POST', 'data/query', ['path' => $path], $jar)[1]['docs'] ?? [], 'id');

echo "المالية ومجموعات المكتب العادية\n";
foreach (['payments', 'expenses', 'contracts', 'invoices', 'receipts', 'vouchers', 'fee_agreements', 'time_entries', 'appointments', 'client_messages', 'client_requests', 'template_folders', 'custom_templates', 'general_memos'] as $c) {
    $ok = $one('SA', 'create', "$c/x1", ['lawyerId' => 'ownerA', 'amount' => 10]) === 200
        && $one('SA', 'create', "$c/x2", ['lawyerId' => 'ownerB']) === 403
        && $ids('B', $c) === []
        && $ids('A', $c) === ['x1']
        && $one('SA', 'delete', "$c/x1") === 200;
    check("$c: كتابة وقراءة وحذف للمكتب فقط", $ok);
}
check('المكتب المنتهية تجربته ما يضيف دفعة', $one('C', 'create', 'payments/c1', ['lawyerId' => 'ownerC']) === 403);

echo "إعدادات المكتب (مدير المكتب وحده)\n";
[$s, $r] = $get('SA', 'office_settings/ownerA');
check('العضو يقرأ إعدادات مكتبه قبل ما تنحفظ (exists=false)', $s === 200 && ($r['exists'] ?? null) === false, [$s, $r]);
[$s] = $get('SA', 'office_settings/ownerB');
check('… لكن مو إعدادات مكتب ثاني', $s === 403, $s);
check('السكرتير ما يعدّل إعدادات المكتب', $one('SA', 'set', 'office_settings/ownerA', ['lawyerId' => 'ownerA', 'name' => 'x']) === 403);
check('المدير يعدّلها', $one('A', 'set', 'office_settings/ownerA', ['lawyerId' => 'ownerA', 'name' => 'مكتب أ']) === 200);
[, $r] = $get('LA', 'office_settings/ownerA');
check('كل الفريق يقرأها بعد الحفظ', ($r['data']['name'] ?? '') === 'مكتب أ', $r);
check('مدير مكتب ثاني ما يكتب فوقها حتى بـ lawyerId مكتبه', $one('B', 'set', 'office_settings/ownerA', ['lawyerId' => 'ownerB']) === 403);
check('المدير ما يحذفها (مدير المنصة فقط)', $one('A', 'delete', 'office_settings/ownerA') === 403);
check('مدير المنصة يحذفها', $one('AD', 'delete', 'office_settings/ownerA') === 200);

echo "حسابات بوابة العملاء\n";
check('السكرتير ما ينشئ حساب بوابة', $one('SA', 'create', 'client_portal_accounts/p1', ['lawyerId' => 'ownerA']) === 403);
check('المدير ينشئه', $one('A', 'create', 'client_portal_accounts/p1', ['lawyerId' => 'ownerA', 'clientId' => 'cl1']) === 200);
check('السكرتير يقرأه', $ids('SA', 'client_portal_accounts') === ['p1']);
check('السكرتير ما يحذفه (حذف نهائي للمدير)', $one('SA', 'delete', 'client_portal_accounts/p1') === 403);

echo "الإشعارات (لصاحبها)\n";
$pdo->exec("INSERT INTO docs (collection, parent_path, id, data) VALUES ('notifications', '', 'n1', '{\"userId\":\"secA\",\"title\":\"قديم بلا مكتب\"}')");
$one('A', 'create', 'notifications/n2', ['lawyerId' => 'ownerA', 'userId' => 'lawyerA', 'title' => 'للمحامي']);
$sa = $ids('SA', 'notifications'); sort($sa);
check('صاحب الإشعار يشوفه حتى بلا lawyerId، والفريق يشوف إشعارات المكتب', $sa === ['n1', 'n2'], $sa);
check('المحامي ما يشوف إشعار قديم لغيره بلا مكتب', $ids('LA', 'notifications') === ['n2']);
check('مكتب ثاني ما يشوف شي', $ids('B', 'notifications') === []);
[$s] = $get('SA', 'notifications/n1');
check('قراءة مباشرة لإشعاري القديم', $s === 200, $s);

echo "سجلات التدقيق (إضافة فقط)\n";
check('العضو يضيف سجل لمكتبه', $one('SA', 'create', 'auditLogs/l1', ['lawyerId' => 'ownerA', 'action' => 'LOGIN']) === 200);
check('حتى لو التجربة انتهت (الدخول نفسه يُسجَّل)', $one('C', 'create', 'auditLogs/l2', ['lawyerId' => 'ownerC', 'action' => 'LOGIN']) === 200);
check('ما يضيف باسم مكتب ثاني', $one('SA', 'create', 'auditLogs/l3', ['lawyerId' => 'ownerB']) === 403);
check('المدير ما يعدّل سجل', $one('A', 'update', 'auditLogs/l1', ['action' => 'X']) === 403);
check('مدير المنصة ما يعدّل سجل', $one('AD', 'set', 'auditLogs/l1', ['lawyerId' => 'ownerA']) === 403);
check('ولا يحذفه', $one('AD', 'delete', 'auditLogs/l1') === 403);
check('documents_access_log نفس الشي', $one('SA', 'create', 'documents_access_log/d1', ['lawyerId' => 'ownerA']) === 200
    && $one('A', 'delete', 'documents_access_log/d1') === 403);

echo "عدّادات الترقيم\n";
$year = (int) gmdate('Y');
$next = fn(string $jar, string $scope, array $extra = []) => call('POST', 'counters/next', ['scope' => $scope, 'year' => $year] + $extra, $jar);
$seq = [];
for ($i = 0; $i < 3; $i++) $seq[] = $next('SA', 'invoices')[1]['value'] ?? null;
check('أرقام متتالية 1، 2، 3', $seq === [1, 2, 3], $seq);
check('كل نوع له تسلسله', ($next('SA', 'receipts')[1]['value'] ?? null) === 1);
check('كل مكتب له تسلسله', ($next('B', 'invoices')[1]['value'] ?? null) === 1);
// قيمة منقولة من Firestore: الترقيم يكمل منها مو من الصفر
$pdo->prepare("INSERT INTO docs (collection, parent_path, id, data) VALUES ('counters', '', ?, ?)")
    ->execute(["ownerA_contracts_$year", json_encode(['lawyerId' => 'ownerA', 'scope' => 'contracts', 'year' => $year, 'value' => 41])]);
check('يكمل من القيمة المنقولة (41 ← 42)', ($next('A', 'contracts')[1]['value'] ?? null) === 42);

// 25 طلب بنفس اللحظة موزّعة على 5 سيرفرات PHP (تزامن حقيقي على القاعدة) — كل رقم مرة وحدة
global $base, $cookies;
$servers = [$base];
for ($p = 8096; $p <= 8099; $p++) $servers[] = harness_extra_server($p);
$mh = curl_multi_init();
$handles = [];
for ($i = 0; $i < 25; $i++) {
    $ch = curl_init($servers[$i % count($servers)] . 'counters/next');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Cookie: mz_session=' . $cookies['A']['mz_session']],
        CURLOPT_POSTFIELDS => json_encode(['scope' => 'vouchers', 'year' => $year])]);
    curl_multi_add_handle($mh, $ch);
    $handles[] = $ch;
}
do { curl_multi_exec($mh, $running); curl_multi_select($mh); } while ($running > 0);
$values = array_map(fn($ch) => json_decode((string) curl_multi_getcontent($ch), true)['value'] ?? null, $handles);
sort($values);
check('25 طلب متزامن ← 25 رقم مختلف من 1 إلى 25 (بدون تكرار)', $values === range(1, 25), $values);

check('نوع ترقيم غير صحيح ← 422', $next('A', 'cases')[0] === 422);
check('سنة غير منطقية ← 422', call('POST', 'counters/next', ['scope' => 'invoices', 'year' => 1999], 'A')[0] === 422);
check('مكتب منتهية تجربته ما ياخذ رقم', $next('C', 'invoices')[0] === 403);
check('lawyerId من الطلب يُتجاهل (ما يلمس عدّاد مكتب ثاني)', ($next('SA', 'invoices', ['lawyerId' => 'ownerB'])[1]['value'] ?? null) === 4);
check('مدير المنصة يحدد المكتب', ($next('AD', 'invoices', ['lawyerId' => 'ownerB'])[1]['value'] ?? null) === 2);
[$s] = call('POST', 'data/query', ['path' => 'counters'], 'A');
check('العدّادات ما تنقرى/تنكتب من API البيانات العام', $s === 400, $s);

harness_finish();
