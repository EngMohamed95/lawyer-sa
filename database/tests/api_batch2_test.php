<?php
/**
 * اختبار الدفعة 2: مجموعات المنصة (الباقات، طلبات الاشتراك، الإعدادات، الحالة، الاستهلاك)،
 * المحادثات الذكية، المكتبة القانونية، الاقتراحات، الدعم الفني، الملفات الخاصة، و ai-proxy.php.
 *
 *   php database/tests/api_batch2_test.php <مسار-إعداد-قاعدة-الاختبار>
 */

declare(strict_types=1);

require __DIR__ . '/_harness.php';

$pdo = harness_start($argv[1] ?? '', 8101, ['files_dir' => sys_get_temp_dir() . '/mz_test_files_' . getmypid()]);
harness_user($pdo, 'ownerA', 'a@t.l', 'LAWYER', null);
harness_user($pdo, 'ownerB', 'b@t.l', 'LAWYER', null);
harness_user($pdo, 'secA', 'sa@t.l', 'SECRETARY', 'ownerA');
harness_user($pdo, 'admin', 'ad@t.l', 'SUPER_ADMIN', 'ALL');
harness_user($pdo, 'ownerT', 't@t.l', 'LAWYER', null, ['subscriptionBilling' => 'trial', 'subscriptionExpiry' => '2099-01-01T00:00:00Z']);
harness_user($pdo, 'ownerX', 'x@t.l', 'LAWYER', null, ['subscriptionBilling' => 'trial', 'trialEndsAt' => '2000-01-01T00:00:00.000Z']);
foreach (['a@t.l' => 'A', 'b@t.l' => 'B', 'sa@t.l' => 'SA', 'ad@t.l' => 'AD', 't@t.l' => 'T', 'x@t.l' => 'X'] as $e => $jar) login($e, $jar);

$w = fn(string $jar, string $type, string $path, array $data = []) => call('POST', 'data/write', ['ops' => [['op' => $type, 'path' => $path] + ($type === 'delete' ? [] : ['data' => $data])]], $jar);
$s = fn(array $r) => $r[0];
$col = fn(string $sql, array $p = []) => (function () use ($pdo, $sql, $p) { $q = $pdo->prepare($sql); $q->execute($p); return $q->fetchColumn(); })();
$get = fn(string $jar, string $path) => call('POST', 'data/get', ['path' => $path], $jar);
$list = fn(string $jar, string $path) => call('POST', 'data/query', ['path' => $path], $jar);
$ids = fn(array $r) => array_column($r[1]['docs'] ?? [], 'id');

echo "الباقات وطلبات الاشتراك (بدون دخول)\n";
check('مدير المنصة يضيف باقة', $s($w('AD', 'set', 'subscriptionPlans/basic', ['name' => 'أساسية', 'quotas' => ['ai' => 5]])) === 200);
check('الزائر يقرأ الباقات بدون دخول', $ids($list('anon', 'subscriptionPlans')) === ['basic']);
check('… ويقرأ باقة بالمعرّف', ($get('anon', 'subscriptionPlans/basic')[1]['data']['name'] ?? '') === 'أساسية');
check('الزائر ما يعدّل باقة (401)', $s($w('anon', 'set', 'subscriptionPlans/basic', ['name' => 'x'])) === 401);
check('مالك مكتب ما يعدّل باقة', $s($w('A', 'update', 'subscriptionPlans/basic', ['name' => 'x'])) === 403);
check('الزائر يرسل طلب اشتراك', $s($w('anon', 'create', 'subscriptionRequests/r1', ['email' => 'new@x.com', 'plan' => 'basic'])) === 200);
check('… لكن ما يقرأ الطلبات (401)', $s($list('anon', 'subscriptionRequests')) === 401);
check('العضو ما يقرأ الطلبات', $s($list('A', 'subscriptionRequests')) === 403);
check('الزائر ما يعدّل طلب موجود (401)', $s($w('anon', 'set', 'subscriptionRequests/r1', ['email' => 'hack'])) === 401);
check('مدير المنصة يقرأ ويعالج الطلبات', $ids($list('AD', 'subscriptionRequests')) === ['r1'] && $s($w('AD', 'update', 'subscriptionRequests/r1', ['status' => 'DONE'])) === 200);
check('الزائر ما يقرأ أي مجموعة ثانية (401)', $s($list('anon', 'cases')) === 401 && $s($list('anon', 'platform_settings')) === 401 && $s($get('anon', 'cases/x')) === 401);

echo "إعدادات المنصة وحالة الخدمة واستهلاك الذكاء\n";
check('مدير المنصة يحفظ الإعدادات', $s($w('AD', 'set', 'platform_settings/ai', ['enabled' => true])) === 200);
check('أي عضو يقرأ الإعدادات', ($get('SA', 'platform_settings/ai')[1]['data']['enabled'] ?? null) === true);
check('إعداد غير موجود ← exists=false (مو 403)', ($get('SA', 'platform_settings/none')[1]['exists'] ?? null) === false);
check('العضو ما يعدّل الإعدادات', $s($w('A', 'set', 'platform_settings/ai', ['enabled' => false])) === 403);
check('حالة الخدمة: العضو ما يقرأ', $s($get('A', 'platform_status/ai')) === 403);
check('حالة الخدمة: مدير المنصة يعيدها OK', $s($w('AD', 'set', 'platform_status/ai', ['state' => 'OK'])) === 200);
$month = gmdate('Y-m');
check('عدّاد مكتبي يُقرأ قبل وجوده', ($get('SA', "ai_usage/ownerA_$month")[1]['exists'] ?? null) === false);
check('عدّاد مكتب ثاني ← 403', $s($get('SA', "ai_usage/ownerB_$month")) === 403);
check('قائمة العدّادات لمدير المنصة فقط', $s($list('A', 'ai_usage')) === 403 && $s($list('AD', 'ai_usage')) === 200);
check('العدّاد ما ينكتب من الواجهة (ولا مدير المنصة)', $s($w('A', 'set', "ai_usage/ownerA_$month", ['count' => 0])) === 403
    && $s($w('AD', 'set', "ai_usage/ownerA_$month", ['count' => 0])) === 403);

echo "محادثات المساعد (لصاحبها فقط)\n";
check('العضو ينشئ محادثته', $s($w('SA', 'create', 'ai_conversations/c1', ['userId' => 'secA', 'lawyerId' => 'ownerA', 'messages' => []])) === 200);
check('ما ينشئ باسم غيره', $s($w('SA', 'create', 'ai_conversations/c2', ['userId' => 'ownerA', 'lawyerId' => 'ownerA', 'messages' => []])) === 403);
check('ما ينشئ لمكتب ثاني', $s($w('SA', 'create', 'ai_conversations/c3', ['userId' => 'secA', 'lawyerId' => 'ownerB', 'messages' => []])) === 403);
check('messages لازم قائمة', $s($w('SA', 'create', 'ai_conversations/c4', ['userId' => 'secA', 'lawyerId' => 'ownerA', 'messages' => 'x'])) === 422);
check('مدير المكتب ما يشوف محادثات موظفيه', $ids($list('A', 'ai_conversations')) === [] && $s($get('A', 'ai_conversations/c1')) === 403);
check('صاحبها يشوفها', $ids($list('SA', 'ai_conversations')) === ['c1']);
check('ما يقدر ينقلها لمكتب ثاني', $s($w('SA', 'update', 'ai_conversations/c1', ['lawyerId' => 'ownerB'])) === 403);
check('مدير المنصة يطّلع', ($get('AD', 'ai_conversations/c1')[0]) === 200);
check('صاحبها يحذفها', $s($w('SA', 'delete', 'ai_conversations/c1')) === 200);

echo "المكتبة القانونية\n";
$item = ['ownerId' => 'secA', 'type' => 'REGULATION', 'title' => 'نظام المرافعات', 'number' => 'م/1', 'createdAt' => '2000-01-01T00:00:00Z'];
check('صاحبها يضيف مادة', $s($w('SA', 'create', 'legal_library/l1', $item)) === 200);
$l1 = $get('SA', 'legal_library/l1')[1]['data'] ?? [];
check('السيرفر يضع وقت الإنشاء (ما يقبل وقت من الواجهة)', ($l1['createdAt'] ?? '') !== '2000-01-01T00:00:00Z' && str_starts_with($l1['createdAt'] ?? '', gmdate('Y')));
check('نوع غير مسموح ← 422', $s($w('SA', 'create', 'legal_library/l2', ['type' => 'X'] + $item)) === 422);
check('حقل غير مسموح ← 422', $s($w('SA', 'create', 'legal_library/l3', $item + ['hack' => 1])) === 422);
check('ملف بمسار مستخدم ثاني ← 422', $s($w('SA', 'create', 'legal_library/l4', $item + ['file' => ['path' => 'legalLibrary/ownerA/x1', 'name' => 'a.pdf', 'size' => 10, 'contentType' => 'application/pdf']])) === 422);
check('ما يضيف باسم غيره', $s($w('A', 'create', 'legal_library/l5', $item)) === 403);
check('مدير المكتب ما يشوف مكتبة موظفه', $ids($list('A', 'legal_library')) === []);
check('ولا يعدّلها', $s($w('A', 'update', 'legal_library/l1', ['title' => 'x'])) === 403);
check('صاحبها يعدّلها ويظل وقت الإنشاء', $s($w('SA', 'update', 'legal_library/l1', ['title' => 'معدّل'])) === 200
    && ($get('SA', 'legal_library/l1')[1]['data']['createdAt'] ?? '') === $l1['createdAt']);

echo "الاقتراحات\n";
$sug = ['title' => 'تحسين البحث', 'details' => 'أبي بحث أسرع في القضايا', 'category' => 'إدارة القضايا والجلسات', 'status' => 'RECEIVED',
    'createdBy' => 'secA', 'requesterName' => 'سكرتير', 'lawyerId' => 'ownerA', 'adminResponse' => '', 'respondedAt' => null];
[$stS1, $rS1] = $w('SA', 'create', 'productSuggestions/s1', $sug);
check('العضو يقدّم اقتراح', $stS1 === 200, $rS1);
check('حالة ابتدائية غير RECEIVED ← 422', $s($w('SA', 'create', 'productSuggestions/s2', ['status' => 'PLANNED'] + $sug)) === 422);
check('مدير المنصة ما يقدّم اقتراح', $s($w('AD', 'create', 'productSuggestions/s3', ['createdBy' => 'admin', 'lawyerId' => 'ALL'] + $sug)) === 403);
check('صاحبه ما يغيّر الحالة', $s($w('SA', 'update', 'productSuggestions/s1', ['status' => 'IMPLEMENTED'])) === 403);
check('زميله ما يشوفه', $ids($list('A', 'productSuggestions')) === []);
check('مدير المنصة يرد', $s($w('AD', 'update', 'productSuggestions/s1', ['status' => 'PLANNED', 'adminResponse' => 'مخطط له'])) === 200);
$s1 = $get('SA', 'productSuggestions/s1')[1]['data'] ?? [];
check('وقت الرد ينحط تلقائياً', is_string($s1['respondedAt'] ?? null) && ($s1['status'] ?? '') === 'PLANNED');
check('مدير المنصة ما يغيّر نص الاقتراح', $s($w('AD', 'update', 'productSuggestions/s1', ['title' => 'x'])) === 403);
check('الاقتراحات ما تنحذف', $s($w('AD', 'delete', 'productSuggestions/s1')) === 403);

echo "الدعم الفني\n";
$ticket = ['subject' => 'مشكلة في الدخول', 'description' => 'ما أقدر أدخل من الجوال', 'category' => 'الحساب والصلاحيات', 'priority' => 'NORMAL',
    'status' => 'OPEN', 'createdBy' => 'secA', 'requesterName' => 'سكرتير', 'lawyerId' => 'ownerA', 'lastMessageId' => '', 'lastReplyBy' => '', 'messageCount' => 1, 'attachments' => []];
check('العضو يفتح تذكرة', $s($w('SA', 'create', 'supportTickets/t1', $ticket)) === 200);
check('أولوية غير صحيحة ← 422', $s($w('SA', 'create', 'supportTickets/t2', ['priority' => 'MEGA'] + $ticket)) === 422);
check('مرفق بمسار تذكرة ثانية ← 422', $s($w('SA', 'create', 'supportTickets/t3', ['attachments' => [['name' => 'a.png', 'path' => 'supportAttachments/t1/secA/x', 'size' => 10, 'type' => 'image/png']]] + $ticket)) === 422);
check('زميله في المكتب ما يشوف التذكرة', $ids($list('A', 'supportTickets')) === [] && $s($get('A', 'supportTickets/t1')) === 403);
[$st, $r] = call('POST', 'support/reply', ['ticketId' => 't1', 'body' => 'أي تحديث؟', 'senderName' => 'سكرتير'], 'SA');
check('صاحبها يرد', $st === 200, [$st, $r]);
[$st] = call('POST', 'support/reply', ['ticketId' => 't1', 'body' => 'نعمل عليها', 'senderName' => 'الدعم'], 'AD');
$t1 = $get('SA', 'supportTickets/t1')[1]['data'] ?? [];
check('رد مدير المنصة: العدد 3، بانتظار رد العميل', $st === 200 && ($t1['messageCount'] ?? 0) === 3 && ($t1['status'] ?? '') === 'WAITING' && ($t1['lastReplyBy'] ?? '') === 'ADMIN', $t1);
check('صاحبها يقرأ الرسائل', count($ids($list('SA', 'supportTickets/t1/messages'))) === 2);
check('زميله ما يقرأ الرسائل', $s($list('A', 'supportTickets/t1/messages')) === 403);
check('رسالة مباشرة بدون endpoint الرد ← 403', $s($w('SA', 'create', 'supportTickets/t1/messages/m9', ['body' => 'x'])) === 403);
check('زميله ما يرد على تذكرته', call('POST', 'support/reply', ['ticketId' => 't1', 'body' => 'x'], 'A')[0] === 403);
check('صاحبها ما يغيّر الحالة لقيد المعالجة', $s($w('SA', 'update', 'supportTickets/t1', ['status' => 'IN_PROGRESS'])) === 403);
check('صاحبها ما يعدّل العنوان', $s($w('SA', 'update', 'supportTickets/t1', ['subject' => 'xxx'])) === 403);
check('صاحبها يغلقها', $s($w('SA', 'update', 'supportTickets/t1', ['status' => 'CLOSED'])) === 200);
check('الرد على مغلقة ← 409', call('POST', 'support/reply', ['ticketId' => 't1', 'body' => 'x'], 'SA')[0] === 409);
check('صاحبها يعيد فتحها', $s($w('SA', 'update', 'supportTickets/t1', ['status' => 'OPEN'])) === 200);
check('التذاكر ما تنحذف', $s($w('AD', 'delete', 'supportTickets/t1')) === 403);

echo "الملفات الخاصة\n";
global $base, $cookies;
function upload(string $jar, array $fields, string $content, string $name, bool $header = true): array {
    global $base, $cookies;
    $tmp = tempnam(sys_get_temp_dir(), 'up');
    file_put_contents($tmp, $content);
    $ch = curl_init($base . 'files/upload');
    $h = [];
    if ($header) $h[] = 'X-Mz-Upload: 1';
    if (!empty($cookies[$jar])) $h[] = 'Cookie: mz_session=' . $cookies[$jar]['mz_session'];
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $h,
        CURLOPT_POSTFIELDS => $fields + ['file' => new CURLFile($tmp, 'application/pdf', $name)]]);
    $body = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    @unlink($tmp);
    return [$status, json_decode($body, true) ?? []];
}
function download(string $jar, string $path): array {
    global $base, $cookies;
    $ch = curl_init($base . 'files/download&path=' . rawurlencode($path));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => !empty($cookies[$jar]) ? ['Cookie: mz_session=' . $cookies[$jar]['mz_session']] : []]);
    $body = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, $body];
}
$pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
[$st, $up] = upload('SA', ['kind' => 'legal'], $pdf, 'نظام.pdf');
check('رفع ملف للمكتبة القانونية', $st === 200 && str_starts_with($up['path'] ?? '', 'legalLibrary/secA/') && ($up['contentType'] ?? '') === 'application/pdf', [$st, $up]);
check('صاحبه ينزّله بنفس المحتوى', download('SA', $up['path'] ?? '') === [200, $pdf]);
check('مدير مكتبه ما ينزّله', download('A', $up['path'] ?? '')[0] === 403);
check('مدير المنصة يطّلع', download('AD', $up['path'] ?? '')[0] === 200);
check('بدون دخول ← 401', download('anon', $up['path'] ?? '')[0] === 401);
check('مسار فيه .. ← 400', download('SA', 'legalLibrary/secA/../../db-config')[0] === 400);
check('ملف نصي متنكّر كـ PDF ← 422', upload('SA', ['kind' => 'legal'], "<?php echo 'hack';", 'x.pdf')[0] === 422);
check('بدون ترويسة X-Mz-Upload (CSRF) ← 403', upload('SA', ['kind' => 'legal'], $pdf, 'a.pdf', false)[0] === 403);
check('مرفق لتذكرة غيره ← 403', upload('A', ['kind' => 'support', 'ticketId' => 't1'], $pdf, 'a.pdf')[0] === 403);
[$st, $att] = upload('SA', ['kind' => 'support', 'ticketId' => 't1'], $pdf, 'لقطة.pdf');
check('صاحب التذكرة يرفع مرفق', $st === 200 && str_starts_with($att['path'] ?? '', 'supportAttachments/t1/secA/'), [$st, $att]);
check('مدير المنصة ينزّل مرفق التذكرة', download('AD', $att['path'] ?? '')[0] === 200);
check('زميله ما ينزّله', download('A', $att['path'] ?? '')[0] === 403);
check('غير صاحبه ما يحذفه', call('POST', 'files/delete', ['path' => $up['path'] ?? ''], 'A')[0] === 403);
check('صاحبه يحذفه', call('POST', 'files/delete', ['path' => $up['path'] ?? ''], 'SA')[0] === 200 && download('SA', $up['path'] ?? '')[0] === 404);

echo "وسيط الذكاء (ai-proxy.php)\n";
function ai(string $jar, string $type = 'application/json'): array {
    global $base, $cookies;
    $ch = curl_init(str_replace('api/index.php?__route=', 'ai-proxy.php', $base));
    $h = ["Content-Type: $type"];
    if (!empty($cookies[$jar])) $h[] = 'Cookie: mz_session=' . $cookies[$jar]['mz_session'];
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $h,
        CURLOPT_POSTFIELDS => json_encode(['provider' => 'GEMINI', 'contents' => [['parts' => [['text' => 'hi']]]]])]);
    $body = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, json_decode($body, true) ?? []];
}
check('بدون دخول ← 401', ai('anon')[0] === 401);
check('نموذج من موقع ثاني (text/plain) ← 415', ai('SA', 'text/plain')[0] === 415);
$pdo->prepare("INSERT INTO docs (collection, parent_path, id, data) VALUES ('ai_usage', '', ?, ?)")->execute(["ownerT_$month", json_encode(['lawyerId' => 'ownerT', 'month' => $month, 'count' => 10])]);
[$st, $r] = ai('T');
check('مكتب تجربة استهلك حصته (10) ← 429 OFFICE_QUOTA قبل ما يوصل للمزوّد', $st === 429 && ($r['code'] ?? '') === 'OFFICE_QUOTA', [$st, $r]);

echo "رفع ملفات القضايا (upload.php)\n";
function legacy_upload(string $jar, string $content, string $name, bool $header = true): array {
    global $base, $cookies;
    $tmp = tempnam(sys_get_temp_dir(), 'up');
    file_put_contents($tmp, $content);
    $ch = curl_init(str_replace('api/index.php?__route=', 'upload.php', $base));
    $h = $header ? ['X-Mz-Upload: 1'] : [];
    if (!empty($cookies[$jar])) $h[] = 'Cookie: mz_session=' . $cookies[$jar]['mz_session'];
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $h,
        CURLOPT_POSTFIELDS => ['file' => new CURLFile($tmp, 'application/octet-stream', $name)]]);
    $body = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    @unlink($tmp);
    return [$status, json_decode($body, true) ?? []];
}
/** GET خام (ملفات ثنائية): [الحالة, الجسم, الترويسات] */
function raw_get(string $jar, string $route): array {
    global $base, $cookies;
    $ch = curl_init($base . $route);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true,
        CURLOPT_HTTPHEADER => !empty($cookies[$jar]) ? ['Cookie: mz_session=' . $cookies[$jar]['mz_session']] : []]);
    $resp = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $hs = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return [$status, substr($resp, $hs), strtolower(substr($resp, 0, $hs))];
}
$filesDir = $GLOBALS['harness_files_dir'];
check('بدون دخول ← 401 (كان مفتوح لأي أحد)', legacy_upload('anon', '%PDF-1.4', 'a.pdf')[0] === 401);
check('بدون ترويسة X-Mz-Upload (CSRF) ← 403', legacy_upload('SA', '%PDF-1.4', 'a.pdf', false)[0] === 403);
check('ملف PHP ← 422', legacy_upload('SA', '<?php echo 1;', 'shell.php')[0] === 422);
check('ملف SVG/HTML ← 422', legacy_upload('SA', '<svg onload=alert(1)>', 'x.svg')[0] === 422 && legacy_upload('SA', '<script>', 'x.html')[0] === 422);
check('صفحة HTML متنكرة بامتداد مسموح (x.heic) ← 422', legacy_upload('SA', "\n<html><script>alert(1)</script>", 'x.heic')[0] === 422);
check('… ولا SVG متنكر كـ txt', legacy_upload('SA', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'x.txt')[0] === 422);
check('تجربة منتهية ← 403', legacy_upload('X', '%PDF-1.4', 'a.pdf')[0] === 403);
check('مدير المنصة ما يرفع لملفات المكاتب ← 403', legacy_upload('AD', '%PDF-1.4', 'a.pdf')[0] === 403);

$secret = "%PDF-1.4\nسري للغاية: مذكرة دفاع " . str_repeat('ABCDEFGH', 190000); // ~1.5MB = أكثر من جزء تشفير
[$st, $r] = legacy_upload('SA', $secret, 'مذكرة.php.pdf');
$url = (string) ($r['fileUrl'] ?? '');
preg_match('#[?&]p=(office/ownerA/([a-f0-9]{32}))#', $url, $pm);
$fp = $pm[1] ?? '';
$fid = $pm[2] ?? '';
check('عضو يرفع PDF ← 200 ورابط فتح محمي (مو uploads/)', $st === 200 && $fp !== '' && !str_contains($url, '/uploads/') && ($r['fileName'] ?? '') === 'مذكرة.php.pdf', [$st, $r]);
$disk = (string) @file_get_contents("$filesDir/$fp");
check('… الملف على القرص مشفّر (ما فيه النص الأصلي)', strlen($disk) > strlen($secret) && !str_contains($disk, 'PDF-1.4') && !str_contains($disk, 'ABCDEFGH'));
check('… وما في نسخة في مجلد الموقع', !is_dir(dirname(__DIR__, 2) . "/public/office"));
$view = fn(string $jar) => raw_get($jar, 'files/view&p=' . rawurlencode($fp));
[$st, $body, $hdr] = $view('SA');
check('عضو المكتب يفتحه ← نفس المحتوى بالضبط', $st === 200 && $body === $secret, [$st, strlen($body)]);
check('… PDF داخل الصفحة مع nosniff', str_contains($hdr, 'content-type: application/pdf') && str_contains($hdr, 'content-disposition: inline') && str_contains($hdr, 'nosniff'));
check('مالك المكتب يفتحه', $view('A')[0] === 200);
check('مكتب ثاني ما يفتحه حتى لو معه الرابط ← 404', $view('B')[0] === 404);
check('مدير المنصة ما يفتح ملفات المكاتب ← 404', $view('AD')[0] === 404);
check('بدون دخول ← 401', $view('anon')[0] === 401);
check('مسار ملف مكتب ثاني (تلاعب بالرابط) ← 404', raw_get('B', 'files/view&p=' . rawurlencode("office/ownerB/$fid"))[0] === 404);
// تلاعب بالملف المشفر على القرص ← ما يطلع محتوى مزوّر
$tampered = $disk; $tampered[40] = chr(ord($tampered[40]) ^ 1);
file_put_contents("$filesDir/$fp", $tampered);
check('ملف معدّل على القرص ← ما ينفك (سلامة GCM)', $view('A')[1] !== $secret && !str_contains($view('A')[1], 'سري'));
file_put_contents("$filesDir/$fp", $disk);
check('… ويرجع سليم بعد استعادته', $view('A')[1] === $secret);

[$st, $log] = call('GET', 'files/access-log', null, 'A');
$who = array_column($log['entries'] ?? [], 'user');
check('سجل الاطلاع: مالك المكتب يشوف مين فتح الملف', $st === 200 && in_array('secA', $who, true) && ($log['entries'][0]['fileName'] ?? '') === 'مذكرة.php.pdf', [$st, $log]);
check('… والعضو العادي ما يشوف السجل ← 403', call('GET', 'files/access-log', null, 'SA')[0] === 403);
check('… وما ينسجل اطلاع مكتب ثاني (رفض)', !in_array('ownerB', $who, true));

[$st, $sh] = call('POST', 'files/share', ['url' => $url, 'days' => 7, 'note' => 'للعميل'], 'SA');
preg_match('#[?&]t=([A-Za-z0-9_-]{43})#', (string) ($sh['url'] ?? ''), $tm);
$tok = $tm[1] ?? '';
check('رابط مشاركة مؤقت للعميل', $st === 200 && $tok !== '' && ($sh['days'] ?? 0) === 7, [$st, $sh]);
check('… التوكن ما ينحفظ نصاً', (int) $col('SELECT COUNT(*) FROM file_shares WHERE token_hash = ?', [$tok]) === 0 && (int) $col('SELECT COUNT(*) FROM file_shares WHERE token_hash = ?', [hash('sha256', $tok)]) === 1);
[$st, $body, $hdr] = raw_get('anon', 'files/shared&t=' . $tok);
check('… يفتح بدون دخول بالرابط', $st === 200 && $body === $secret && str_contains($hdr, 'no-store'), $st);
check('… ورابط مزوّر ← 410', raw_get('anon', 'files/shared&t=' . str_repeat('a', 43))[0] === 410);
check('مكتب ثاني ما يشارك ملفي ← 404', call('POST', 'files/share', ['url' => $url], 'B')[0] === 404);
check('مدة أكثر من 30 يوم ← 422', call('POST', 'files/share', ['url' => $url, 'days' => 31], 'SA')[0] === 422);
[$st, $list] = call('GET', 'files/shares', null, 'A');
$share = $list['shares'][0] ?? [];
check('المالك يشوف روابط مكتبه ومين أنشأها وعدد الفتح', $st === 200 && ($share['active'] ?? false) && ($share['uses'] ?? 0) === 1 && ($share['note'] ?? '') === 'للعميل', [$st, $list]);
check('مكتب ثاني ما يشوفها', (call('GET', 'files/shares', null, 'B')[1]['shares'] ?? null) === []);
check('مكتب ثاني ما يلغيها', call('POST', 'files/shares/revoke', ['id' => $share['id'] ?? ''], 'B')[0] === 404);
check('المالك يلغي الرابط', call('POST', 'files/shares/revoke', ['id' => $share['id'] ?? ''], 'A')[0] === 200);
check('… فما يفتح بعدها ← 410', raw_get('anon', 'files/shared&t=' . $tok)[0] === 410);
check('سجل الاطلاع فيه الفتح برابط المشاركة', in_array(true, array_column(call('GET', 'files/access-log', null, 'A')[1]['entries'] ?? [], 'viaShare'), true));

echo "نقل ملفات uploads/ القديمة وتشفيرها\n";
$uploadsDir = dirname(__DIR__, 2) . '/public/uploads/';
@mkdir($uploadsDir, 0755, true);
@unlink($uploadsDir . '.htaccess');
$legacyName = '1700000000_abcd1234_عقد قديم.pdf';
$legacyBody = "%PDF-1.4 legacy " . bin2hex(random_bytes(8));
file_put_contents($uploadsDir . $legacyName, $legacyBody);
file_put_contents($uploadsDir . '1700000001_ffff0000_logo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
// روابط بالشكل المحفوظ فعلاً (json_encode يهرّب / )، ومستند لمكتب ثاني يذكر نفس الملف
$legacyUrl = 'https://mawazzen.com/uploads/' . rawurlencode($legacyName);
$pdo->prepare("INSERT INTO docs (collection, parent_path, id, data) VALUES ('clients', '', 'legacyA', ?), ('clients', '', 'legacyB', ?), ('cases', '', 'legacyMissing', ?)")
    ->execute([json_encode(['lawyerId' => 'ownerA', 'fullName' => 'قديم', 'files' => [['url' => $legacyUrl, 'meta' => new stdClass()]]]),
        json_encode(['lawyerId' => 'ownerB', 'fullName' => 'قديم ب', 'attachment' => $legacyUrl]),
        json_encode(['lawyerId' => 'ownerA', 'title' => 'ملف ضايع', 'fileUrl' => 'https://mawazzen.com/uploads/gone.pdf'])]);
$pdo->prepare("UPDATE docs SET data = JSON_SET(data, '$.logoUrl', ?) WHERE collection = 'users' AND id = 'ownerA'")->execute(['https://mawazzen.com/uploads/1700000001_ffff0000_logo.png']);
check('غير مدير المنصة ما يشغّل النقل ← 403', call('POST', 'files/migrate-legacy', [], 'A')[0] === 403);
$total = ['filesMigrated' => 0, 'missing' => 0, 'docsUpdated' => 0];
$cursor = null;
for ($i = 0; $i < 20; $i++) {
    [$st, $mr] = call('POST', 'files/migrate-legacy', $cursor ? ['cursor' => $cursor] : [], 'AD');
    if ($st !== 200) break;
    foreach ($total as $k => $_) $total[$k] += $mr[$k] ?? 0;
    $cursor = $mr['cursor'] ?? null;
    if ($mr['done'] ?? false) break;
}
check('النقل يخلص: 3 ملفات (العقد لمكتبين + الشعار) و3 مستندات، وملف مفقود واحد', $st === 200 && $total === ['filesMigrated' => 3, 'missing' => 1, 'docsUpdated' => 3], [$st, $total]);
$dataOf = fn(string $c, string $id) => json_decode((string) $col('SELECT data FROM docs WHERE collection = ? AND id = ?', [$c, $id]), true);
$aUrl = $dataOf('clients', 'legacyA')['files'][0]['url'] ?? '';
$bUrl = $dataOf('clients', 'legacyB')['attachment'] ?? '';
check('… الرابط في مستند المكتب صار رابط محمي لمكتبه', str_contains($aUrl, 'files/view?p=office/ownerA/') && str_contains($bUrl, 'files/view?p=office/ownerB/'), [$aUrl, $bUrl]);
check('… والكائنات الفاضية ظلت {}', str_contains((string) $col("SELECT data FROM docs WHERE collection = 'clients' AND id = 'legacyA'"), '"meta": {}') || str_contains((string) $col("SELECT data FROM docs WHERE collection = 'clients' AND id = 'legacyA'"), '"meta":{}'));
check('… والملف المفقود ظل رابطه كما هو', ($dataOf('cases', 'legacyMissing')['fileUrl'] ?? '') === 'https://mawazzen.com/uploads/gone.pdf');
preg_match('#p=(office/[^&]+)#', $aUrl, $am);
[$st, $body] = raw_get('A', 'files/view&p=' . rawurlencode($am[1] ?? ''));
check('… والمكتب يفتح ملفه القديم (نفس المحتوى)', $st === 200 && $body === $legacyBody, $st);
check('… ومكتب ب ما يفتح نسخة مكتب أ', raw_get('B', 'files/view&p=' . rawurlencode($am[1] ?? ''))[0] === 404);
$logo = $dataOf('users', 'ownerA')['logoUrl'] ?? '';
check('… وشعار المكتب انتقل', str_contains($logo, 'p=office/ownerA/'), $logo);
check('… والاسم المعروض بدون الوقت والجزء العشوائي', (string) $col("SELECT name FROM office_files WHERE legacy_name = ? AND tenant = 'ownerA'", [$legacyName]) === 'عقد قديم.pdf');
check('إعادة النقل ما تكرر شي', call('POST', 'files/migrate-legacy', [], 'AD')[1]['filesMigrated'] === 0);
check('ملفات uploads/ القديمة لسه موجودة قبل الإنهاء', is_file($uploadsDir . $legacyName));
[$st, $fin] = call('POST', 'files/migrate-legacy/finalize', [], 'AD');
clearstatcache(); // الحذف صار في عملية الخادم — نتيجة is_file السابقة محفوظة هنا
check('الإنهاء: يتأكد من النسخ المشفرة ثم يحذف الأصل', $st === 200 && ($fin['deleted'] ?? 0) === 2 && !is_file($uploadsDir . $legacyName), [$st, $fin]);
check('… ويقفل مجلد uploads بالكامل', str_contains((string) @file_get_contents($uploadsDir . '.htaccess'), 'Require all denied'));
@unlink($uploadsDir . '.htaccess');

echo "طلبات الاشتراك وإعدادات المكتب\n";
check('طلب اشتراك باسم مكتب ثاني وحالة «مقبول» ← ينحفظ باسمي ومعلّق',
    $s($w('A', 'create', 'subscriptionRequests/sr1', ['userId' => 'ownerB', 'status' => 'approved', 'planId' => 'pro'])) === 200
    && ($col("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) FROM docs WHERE collection = 'subscriptionRequests' AND id = 'sr1'") === 'ownerA')
    && ($col("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) FROM docs WHERE collection = 'subscriptionRequests' AND id = 'sr1'") === 'pending'));
check('مكتب ما ينشئ إعدادات مكتب ثاني قبله ← 403', $s($w('A', 'set', 'office_settings/ownerB', ['lawyerId' => 'ownerA', 'officeProfile' => ['name' => 'مزوّر']])) === 403);
check('… ولا بـ lawyerId المكتب الثاني', $s($w('A', 'set', 'office_settings/ownerB', ['lawyerId' => 'ownerB'])) === 403);
check('المكتب ينشئ إعداداته', $s($w('B', 'set', 'office_settings/ownerB', ['lawyerId' => 'ownerB', 'officeProfile' => ['name' => 'مكتب ب']])) === 200);

harness_finish();
