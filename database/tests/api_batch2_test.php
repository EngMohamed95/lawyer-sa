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
$uploadsDir = dirname(__DIR__, 2) . '/public/uploads/';
check('بدون دخول ← 401 (كان مفتوح لأي أحد)', legacy_upload('anon', '%PDF-1.4', 'a.pdf')[0] === 401);
check('بدون ترويسة X-Mz-Upload (CSRF) ← 403', legacy_upload('SA', '%PDF-1.4', 'a.pdf', false)[0] === 403);
check('ملف PHP ← 422', legacy_upload('SA', '<?php echo 1;', 'shell.php')[0] === 422);
check('ملف SVG/HTML ← 422', legacy_upload('SA', '<svg onload=alert(1)>', 'x.svg')[0] === 422 && legacy_upload('SA', '<script>', 'x.html')[0] === 422);
check('تجربة منتهية ← 403', legacy_upload('X', '%PDF-1.4', 'a.pdf')[0] === 403);
[$st, $r] = legacy_upload('SA', '%PDF-1.4 test', 'عقد.php.pdf');
$stored = (string) ($r['fileName'] ?? '');
check('عضو يرفع PDF ← 200 ورابط uploads', $st === 200 && str_contains((string) ($r['fileUrl'] ?? ''), "/uploads/$stored") && is_file($uploadsDir . $stored), [$st, $r]);
check('… الاسم بلا امتداد مزدوج (ما في .php.)', str_ends_with($stored, '.pdf') && !str_contains($stored, '.php') && str_contains($stored, 'عقد'), $stored);
check('… ومجلد uploads فيه حماية .htaccess', str_contains((string) @file_get_contents($uploadsDir . '.htaccess'), 'Require all denied'));
if ($stored !== '') @unlink($uploadsDir . $stored);

echo "طلبات الاشتراك وإعدادات المكتب\n";
check('طلب اشتراك باسم مكتب ثاني وحالة «مقبول» ← ينحفظ باسمي ومعلّق',
    $s($w('A', 'create', 'subscriptionRequests/sr1', ['userId' => 'ownerB', 'status' => 'approved', 'planId' => 'pro'])) === 200
    && ($col("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.userId')) FROM docs WHERE collection = 'subscriptionRequests' AND id = 'sr1'") === 'ownerA')
    && ($col("SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) FROM docs WHERE collection = 'subscriptionRequests' AND id = 'sr1'") === 'pending'));
check('مكتب ما ينشئ إعدادات مكتب ثاني قبله ← 403', $s($w('A', 'set', 'office_settings/ownerB', ['lawyerId' => 'ownerA', 'officeProfile' => ['name' => 'مزوّر']])) === 403);
check('… ولا بـ lawyerId المكتب الثاني', $s($w('A', 'set', 'office_settings/ownerB', ['lawyerId' => 'ownerB'])) === 403);
check('المكتب ينشئ إعداداته', $s($w('B', 'set', 'office_settings/ownerB', ['lawyerId' => 'ownerB', 'officeProfile' => ['name' => 'مكتب ب']])) === 200);

harness_finish();
