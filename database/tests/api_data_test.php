<?php
/**
 * اختبار تكامل لمخزن المستندات (المرحلة 2): عزل المكاتب، التكليف، المجموعات الفرعية، الكتابة.
 *
 *   php database/tests/api_data_test.php <مسار-إعداد-قاعدة-الاختبار>
 */

declare(strict_types=1);

require __DIR__ . '/_harness.php';

$pdo = harness_start($argv[1] ?? '', 8092);
harness_user($pdo, 'ownerA', 'a@t.l', 'LAWYER', null);
harness_user($pdo, 'ownerB', 'b@t.l', 'LAWYER', null);
harness_user($pdo, 'ownerC', 'c@t.l', 'LAWYER', null, ['subscriptionBilling' => 'trial', 'trialEndsAt' => '2020-01-01T00:00:00Z']);
harness_user($pdo, 'lawyerA', 'la@t.l', 'OFFICE_LAWYER', 'ownerA');
harness_user($pdo, 'secA', 'sa@t.l', 'SECRETARY', 'ownerA');
harness_user($pdo, 'clientA', 'ca@t.l', 'CLIENT', 'ownerA');
harness_user($pdo, 'admin', 'ad@t.l', 'SUPER_ADMIN', 'ALL');
foreach (['a@t.l' => 'A', 'b@t.l' => 'B', 'c@t.l' => 'C', 'la@t.l' => 'LA', 'sa@t.l' => 'SA', 'ca@t.l' => 'CA', 'ad@t.l' => 'AD'] as $e => $jar) login($e, $jar);

$write = fn(string $jar, array $ops) => call('POST', 'data/write', ['ops' => $ops], $jar);
$create = fn(string $jar, string $path, array $data) => $write($jar, [['op' => 'create', 'path' => $path, 'data' => $data]]);
$query = fn(string $jar, array $req) => call('POST', 'data/query', $req, $jar);
$get = fn(string $jar, string $path) => call('POST', 'data/get', ['path' => $path], $jar);
$ids = fn(array $r) => array_column($r['docs'] ?? [], 'id');

echo "عزل المكاتب\n";
[$s] = $create('A', 'cases/c1', ['lawyerId' => 'ownerA', 'title' => 'قضية 1', 'assignedLawyerIds' => ['lawyerA'], 'status' => 'OPEN']);
check('المالك ينشئ قضية في مكتبه', $s === 200, $s);
[$s] = $create('A', 'cases/c2', ['lawyerId' => 'ownerA', 'title' => 'قضية 2', 'status' => 'CLOSED']);
check('قضية ثانية غير مكلّف بها المحامي', $s === 200, $s);
[$s, $r] = $create('A', 'cases/evil', ['lawyerId' => 'ownerB', 'title' => 'x']);
check('ما يقدر ينشئ سجل باسم مكتب ثاني ← 403', $s === 403, [$s, $r]);
[$s, $r] = $create('A', 'cases/nolawyer', ['title' => 'x']);
check('سجل بلا lawyerId ← 403', $s === 403, [$s, $r]);
[$s, $r] = $query('B', ['path' => 'cases']);
check('مكتب ثاني ما يشوف قضايا مكتبي', $s === 200 && $ids($r) === [], [$s, $r]);
[$s, $r] = $query('B', ['path' => 'cases', 'where' => [['lawyerId', '==', 'ownerA']]]);
check('حتى لو طلب lawyerId مكتبي صراحة', $s === 200 && $ids($r) === [], [$s, $r]);
[$s, $r] = $get('B', 'cases/c1');
check('قراءة مباشرة لقضية مكتب ثاني ← 403', $s === 403, [$s, $r]);
[$s, $r] = $write('B', [['op' => 'update', 'path' => 'cases/c1', 'data' => ['title' => 'hacked']]]);
check('تعديل قضية مكتب ثاني ← 403', $s === 403, [$s, $r]);
[$s, $r] = $write('B', [['op' => 'set', 'path' => 'cases/c1', 'data' => ['lawyerId' => 'ownerB', 'title' => 'stolen']]]);
check('الكتابة فوق قضية مكتب ثاني (set) ← 403', $s === 403, [$s, $r]);
[$s, $r] = $query('A', ['path' => 'cases', 'where' => [['lawyerId', '==', 'ownerA']]]);
check('المالك يشوف قضاياه', $s === 200 && count($ids($r)) === 2, [$s, $r]);
[$s, $r] = $write('A', [['op' => 'update', 'path' => 'cases/c2', 'data' => ['lawyerId' => 'ownerB']]]);
check('ما يقدر ينقل سجل لمكتب ثاني ← 403', $s === 403, [$s, $r]);
[$s, $r] = $query('CA', ['path' => 'cases']);
check('عميل البوابة ما يوصل لبيانات المكتب ← 403', $s === 403, [$s, $r]);
[$s, $r] = $query('nobody', ['path' => 'cases']);
check('بدون جلسة ← 401', $s === 401, [$s, $r]);

echo "المحامي المكلّف\n";
[$s, $r] = $query('LA', ['path' => 'cases']);
check('يشوف القضية المكلّف بها فقط', $s === 200 && $ids($r) === ['c1'], [$s, $r]);
[$s] = $get('LA', 'cases/c2');
check('قراءة قضية غير مكلّف بها ← 403', $s === 403, $s);
[$s] = $write('LA', [['op' => 'update', 'path' => 'cases/c2', 'data' => ['title' => 'x']]]);
check('تعديل قضية غير مكلّف بها ← 403', $s === 403, $s);
[$s] = $write('LA', [['op' => 'update', 'path' => 'cases/c1', 'data' => ['notes' => 'ملاحظة']]]);
check('يعدّل قضيته', $s === 200, $s);
[, $r] = call('POST', 'data/count', ['path' => 'cases'], 'LA');
check('العدّ يطبّق نفس الحدود', ($r['count'] ?? -1) === 1, $r);
$create('A', 'cases/c3', ['lawyerId' => 'ownerA', 'title' => 'قضية 3', 'assignedLawyerId' => 'lawyerA']);
[, $r] = $query('LA', ['path' => 'cases']);
check('التكليف القديم (assignedLawyerId) يُحترم', count($ids($r)) === 2, $r);

echo "المجموعات الفرعية\n";
[$s] = $create('A', 'cases/c1/hearings/h1', ['date' => '2026-12-01', 'court' => 'العامة']);
check('جلسة تحت القضية', $s === 200, $s);
[, $r] = $get('A', 'cases/c1/hearings/h1');
check('الجلسة ورثت lawyerId من القضية', ($r['data']['lawyerId'] ?? null) === 'ownerA', $r);
[$s, $r] = $query('LA', ['path' => 'cases/c1/hearings']);
check('المحامي المكلّف يشوف جلسات قضيته', $s === 200 && $ids($r) === ['h1'], [$s, $r]);
$create('A', 'cases/c2/hearings/h2', ['date' => '2026-12-02']);
[$s] = $query('LA', ['path' => 'cases/c2/hearings']);
check('… وما يشوف جلسات قضية غير مكلّف بها ← 403', $s === 403, $s);
[$s] = $get('B', 'cases/c1/hearings/h1');
check('مكتب ثاني ما يقرأ جلسة ← 403', $s === 403, $s);
[$s] = $create('B', 'cases/c1/hearings/hx', ['lawyerId' => 'ownerB']);
check('مكتب ثاني ما يضيف جلسة لقضيتي ← 403', $s === 403, $s);
[$s] = $create('A', 'cases/c1/hearings/hy', ['lawyerId' => 'ownerB']);
check('جلسة بـ lawyerId مكتب ثاني ← 403', $s === 403, $s);
[$s] = $create('A', 'cases/ghost/hearings/hz', ['date' => 'x']);
check('جلسة تحت قضية غير موجودة ← 403', $s === 403, $s);

echo "استعلامات عبر كل القضايا (collectionGroup)\n";
$create('B', 'cases/cB', ['lawyerId' => 'ownerB', 'title' => 'قضية B']);
$create('B', 'cases/cB/hearings/hB', ['date' => '2026-12-03']);
[$s, $r] = $query('A', ['group' => 'hearings']);
check('كل جلسات مكتبي باستعلام واحد (بدل طلب لكل قضية)', $s === 200 && $ids($r) === ['h1', 'h2'], [$s, $ids($r)]);
[$s, $r] = $query('B', ['group' => 'hearings']);
check('… ومكتب ثاني يشوف جلساته بس', $s === 200 && $ids($r) === ['hB'], [$s, $ids($r)]);
[$s, $r] = $query('LA', ['group' => 'hearings']);
check('المحامي المكلّف: جلسات قضاياه المكلّف بها فقط', $s === 200 && $ids($r) === ['h1'], [$s, $ids($r)]);
[$s, $r] = $query('AD', ['group' => 'hearings']);
check('مدير المنصة يشوفها كلها مع المسار', $s === 200 && count($r['docs'] ?? []) === 3 && str_starts_with($r['docs'][0]['path'] ?? '', 'cases/'), [$s, $r]);
$create('A', 'clients/cl1', ['lawyerId' => 'ownerA', 'name' => 'عميل']);
$create('A', 'clients/cl1/documents/d1', ['name' => 'عقد.pdf']);
$create('A', 'cases/c1/documents/d2', ['name' => 'مذكرة.pdf']);
$create('B', 'clients/clB', ['lawyerId' => 'ownerB', 'name' => 'عميل B']);
$create('B', 'clients/clB/documents/d3', ['name' => 'B.pdf']);
[$s, $r] = $query('SA', ['group' => 'documents', 'where' => [['lawyerId', '==', 'ownerA']]]);
check('المستندات عبر القضايا والعملاء لمكتبي فقط', $s === 200 && count($r['docs'] ?? []) === 2, [$s, $r]);
$create('A', 'cases/c2/documents/d4', ['name' => 'قضية غير مكلّف بها.pdf']);
[$s, $r] = $query('LA', ['group' => 'documents']);
$laDocs = $ids($r); sort($laDocs);
check('المحامي المكلّف: مستندات قضاياه + مستندات العملاء، بدون قضايا غيره', $s === 200 && $laDocs === ['d1', 'd2'], [$s, $laDocs]);
[$s] = $query('A', ['group' => 'payments']);
check('مجموعة غير مسموحة ← 400', $s === 400, $s);

echo "الكتابة بنفس سلوك Firestore\n";
$write('A', [['op' => 'update', 'path' => 'cases/c1', 'data' => ['meta.x' => 1, 'empty' => new stdClass(), 'price' => 10.0], 'deletes' => ['notes']]]);
[, $raw] = call('POST', 'data/get', ['path' => 'cases/c1'], 'A', 'application/json', false);
check('تحديث بمسار متداخل (meta.x)', ($raw->data->meta->x ?? null) === 1, $raw);
check('الخريطة الفاضية تظل {} مو []', isset($raw->data->empty) && is_object($raw->data->empty), $raw->data ?? null);
check('deleteField يحذف الحقل', !property_exists($raw->data, 'notes'), $raw->data ?? null);
check('النص العربي محفوظ', ($raw->data->title ?? '') === 'قضية 1');
$write('A', [['op' => 'set', 'path' => 'cases/c1', 'merge' => true, 'data' => ['meta' => ['y' => 2]]]]);
[, $r] = $get('A', 'cases/c1');
check('set مع merge يدمج بعمق', ($r['data']['meta'] ?? null) == ['x' => 1, 'y' => 2], $r['data']['meta'] ?? null);
[$s] = $write('A', [['op' => 'update', 'path' => 'cases/none', 'data' => ['a' => 1]]]);
check('update لسجل رئيسي غير موجود ← 403 (مثل Firestore)', $s === 403, $s);
[$s] = $write('A', [['op' => 'update', 'path' => 'cases/c1/hearings/none', 'data' => ['a' => 1]]]);
check('update لمستند فرعي غير موجود ← 404', $s === 404, $s);
[$s] = $create('A', 'cases/c1', ['lawyerId' => 'ownerA']);
check('create لسجل موجود ← 409', $s === 409, $s);
[$s] = $get('A', 'cases/none');
check('get لسجل رئيسي غير موجود ← 403 (نفس رد مكتب ثاني، مثل Firestore)', $s === 403, $s);
[$s, $r] = $get('A', 'cases/c1/hearings/none');
check('get لمستند فرعي غير موجود تحت قضيتي ← exists=false', $s === 200 && ($r['exists'] ?? null) === false, [$s, $r]);
[$s] = $create('B', 'cases/c1', ['lawyerId' => 'ownerB']);
check('create فوق سجل مكتب ثاني ← 403 مو 409 (ما نكشف وجوده)', $s === 403, $s);

echo "الدفعات والحذف\n";
[$s] = $write('A', [
    ['op' => 'create', 'path' => 'tasks/t1', 'data' => ['lawyerId' => 'ownerA', 'title' => 'مهمة']],
    ['op' => 'create', 'path' => 'cases/bad', 'data' => ['lawyerId' => 'ownerB']],
]);
$t1 = (int) $pdo->query("SELECT COUNT(*) FROM docs WHERE collection = 'tasks' AND id = 't1'")->fetchColumn();
check('دفعة فيها عملية مرفوضة ← ولا وحدة تنكتب', $s === 403 && $t1 === 0, [$s, $t1]);
$create('A', 'tasks/t1', ['lawyerId' => 'ownerA', 'title' => 'مهمة']);
[$s] = $write('SA', [['op' => 'delete', 'path' => 'cases/c2']]);
check('السكرتير ما يحذف قضية نهائياً ← 403', $s === 403, $s);
[$s] = $write('SA', [['op' => 'delete', 'path' => 'tasks/t1']]);
check('السكرتير يحذف مهمة', $s === 200, $s);
[$s] = $write('A', [['op' => 'delete', 'path' => 'cases/c2']]);
check('المالك يحذف قضية', $s === 200, $s);
[$s] = $write('A', [['op' => 'delete', 'path' => 'cases/c2']]);
check('حذف سجل محذوف = نجاح (مثل Firestore)', $s === 200, $s);
[$s] = $write('B', [['op' => 'delete', 'path' => 'clients/cl1']]);
check('مكتب ثاني ما يحذف عميلي ← 403', $s === 403, $s);

echo "الفترة التجريبية المنتهية\n";
[$s] = $create('C', 'clients/clC', ['lawyerId' => 'ownerC', 'name' => 'x']);
check('مكتب انتهت تجربته ما يكتب ← 403', $s === 403, $s);
[$s] = $query('C', ['path' => 'clients']);
check('… لكن يقرأ بياناته', $s === 200, $s);

echo "الاستعلامات\n";
foreach ([['t2', 'open', 3, ['x']], ['t3', 'done', 1, ['y']], ['t4', 'open', 2, ['x', 'y']], ['t5', 'late', 5, []]] as [$id, $st, $pr, $tags]) {
    $create('A', "tasks/$id", ['lawyerId' => 'ownerA', 'status' => $st, 'priority' => $pr, 'tags' => $tags]);
}
$q = fn(array $where, array $extra = []) => $ids($query('A', ['path' => 'tasks', 'where' => $where, 'orderBy' => [['priority', 'asc']]] + $extra)[1]);
check('== مع ترتيب', $q([['status', '==', 'open']]) === ['t4', 't2']);
check('in', $q([['status', 'in', ['done', 'late']]]) === ['t3', 't5']);
check('!=', $q([['status', '!=', 'open']]) === ['t3', 't5']);
check('>= على رقم', $q([['priority', '>=', 3]]) === ['t2', 't5']);
check('array-contains', $q([['tags', 'array-contains', 'y']]) === ['t3', 't4']);
check('array-contains-any', $q([['tags', 'array-contains-any', ['x']]]) === ['t4', 't2']);
check('or', $q([['or' => [['status', '==', 'done'], ['priority', '==', 5]]]]) === ['t3', 't5']);
check('or فيه and متداخل', $q([['or' => [['status', '==', 'done'], ['and' => [['status', '==', 'open'], ['priority', '>', 2]]]]]]) === ['t3', 't2']);
[$s] = $query('A', ['path' => 'tasks', 'where' => [['or' => []]]]);
check('or فاضي ← 400', $s === 400, $s);
[$s] = $query('A', ['path' => 'tasks', 'where' => [['or' => [['or' => [['or' => [['or' => [['status', '==', 'x']]]]]]]]]]]);
check('تداخل أعمق من 3 ← 400', $s === 400, $s);
[, $r] = $query('A', ['path' => 'tasks', 'orderBy' => [['priority', 'desc']], 'limit' => 2]);
check('limit + desc + hasMore', $ids($r) === ['t5', 't2'] && ($r['hasMore'] ?? null) === true, $r);
[, $r] = $query('A', ['path' => 'tasks', 'orderBy' => [['priority', 'desc']], 'limit' => 2, 'offset' => 2]);
check('الصفحة الثانية', $ids($r) === ['t4', 't3'] && ($r['hasMore'] ?? null) === false, $r);

check('== على نص ما يطابق رقم بنفس القيمة', $q([['priority', '==', '3']]) === []);
check('> على رقم ما يطابق النصوص', $q([['status', '>', 0]]) === []);
foreach ([['n9', 9], ['n10', 10], ['n100', 100]] as [$id, $n]) $create('A', "tasks/$id", ['lawyerId' => 'ownerA', 'num' => $n]);
[, $r] = $query('A', ['path' => 'tasks', 'where' => [['num', '>=', 0]], 'orderBy' => [['num', 'asc']]]);
check('الأرقام تترتب كأرقام (9 قبل 10 قبل 100)', $ids($r) === ['n9', 'n10', 'n100'], $ids($r));
$create('A', 'tasks/strtags', ['lawyerId' => 'ownerA', 'tags' => 'x']);
check('array-contains ما يطابق حقل نصي', !in_array('strtags', $q([['tags', 'array-contains', 'x']]), true));

echo "حذف القضية يحذف ما تحتها (ما في مستندات يتيمة)\n";
$create('A', 'cases/gone', ['lawyerId' => 'ownerA', 'title' => 'x']);
$create('A', 'cases/gone/hearings/g1', ['date' => 'x']);
$create('A', 'cases/gone/documents/g2', ['name' => 'سري.pdf']);
$write('A', [['op' => 'delete', 'path' => 'cases/gone']]);
check('الجلسات والمستندات انحذفت مع القضية', (int) $pdo->query("SELECT COUNT(*) FROM docs WHERE parent_path = 'cases/gone'")->fetchColumn() === 0);
// يتيم قديم (من قبل الإصلاح أو من Firestore) لمكتب A
$pdo->exec("INSERT INTO docs (collection, parent_path, id, data) VALUES ('hearings', 'cases/orphan', 'o1', '{\"lawyerId\":\"ownerA\",\"note\":\"سري\"}')");
[$s] = $create('B', 'cases/orphan', ['lawyerId' => 'ownerB', 'title' => 'تبني']);
check('مكتب ثاني ما يقدر يتبنى مستندات يتيمة بإنشاء قضية بنفس المعرّف ← 403', $s === 403, $s);
[$s] = $create('A', 'cases/orphan', ['lawyerId' => 'ownerA', 'title' => 'استرجاع']);
check('… لكن المكتب صاحبها يقدر', $s === 200, $s);

echo "تغيّر الدور/الحالة أثناء الجلسة\n";
$stale = fn(string $id) => $pdo->exec("UPDATE users SET profile_synced_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE) WHERE id = '$id'");
$setProfile = fn(string $id, array $patch) => $pdo->prepare("UPDATE users SET data = JSON_SET(data, " . implode(', ', array_map(fn($k) => "'$." . $k . "', ?", array_keys($patch))) . ") WHERE id = ?")->execute([...array_values($patch), $id]);
[$s] = $query('SA', ['path' => 'clients']);
check('السكرتير يقرأ العملاء', $s === 200, $s);
$setProfile('secA', ['role' => 'CLIENT']); // المالك حوّله لعميل في Firestore
[$s] = $query('SA', ['path' => 'clients']);
check('خلال دقيقة من آخر تحديث: لسه بالدور القديم (حد التحديث)', $s === 200, $s);
$stale('secA');
[$s] = $query('SA', ['path' => 'clients']);
check('بعد دقيقة: الدور الجديد ينطبق على الجلسة المفتوحة ← 403', $s === 403, $s);
$setProfile('ownerB', ['status' => 'DISABLED']); // المنصة أوقفت مكتب B
$stale('ownerB');
[$s] = $query('B', ['path' => 'clients']);
check('مكتب أوقفته المنصة: الجلسة المفتوحة تنقطع ← 403', $s === 403, $s);
$setProfile('ownerC', ['subscriptionBilling' => 'paid']); // اشترك
$stale('ownerC');
[$s] = $create('C', 'clients/clC2', ['lawyerId' => 'ownerC', 'name' => 'x']);
check('مكتب اشترك للتو: الكتابة تنفتح بدون إعادة دخول', $s === 200, $s);
harness_user($pdo, 'ownerE', 'e@t.l', 'LAWYER', null, ['subscriptionBilling' => 'trial', 'trialEndsAt' => 'تاريخ تالف']);
login('e@t.l', 'E');
[$s] = $create('E', 'clients/clE', ['lawyerId' => 'ownerE', 'name' => 'x']);
check('تاريخ نهاية تجربة تالف ← الكتابة مقفلة (مو مفتوحة)', $s === 403, $s);

echo "التكليف بأنواع غلط\n";
$create('A', 'cases/strassign', ['lawyerId' => 'ownerA', 'assignedLawyerIds' => 'lawyerA']);
[, $r] = $query('LA', ['path' => 'cases']);
check('assignedLawyerIds كنص (مو قائمة) ما يعطي وصول — القائمة والفتح متطابقين', !in_array('strassign', $ids($r), true), $ids($r));

echo "حماية المدخلات\n";
[$s] = $get('A', 'cases/a/hearings/b/x/y/z/w');
check('مسار أطول من 6 أجزاء ← 400', $s === 400, $s);
[$s, $r] = $query('A', ['path' => 'supportTickets']);
check('مجموعة ما انتقلت ← 400 NOT_MIGRATED', $s === 400 && ($r['code'] ?? '') === 'NOT_MIGRATED', [$s, $r]);
[$s] = $query('A', ['path' => 'tasks', 'where' => [["status') OR 1=1 -- ", '==', 'x']]]);
check('اسم حقل فيه حقن SQL ← 400', $s === 400, $s);
[$s] = $query('A', ['path' => 'tasks', 'orderBy' => [['priority; DROP TABLE docs', 'asc']]]);
check('ترتيب فيه حقن ← 400', $s === 400, $s);
[$s] = $get('A', 'cases/../users/ownerB');
check('مسار فيه .. ← 400', $s === 400, $s);
[$s] = $query('A', ['path' => 'tasks', 'where' => [['status', '==', "x' OR '1'='1"]]]);
check('قيمة فيها علامات اقتباس آمنة', $s === 200, $s);
check('الجدول سليم', (int) $pdo->query('SELECT COUNT(*) FROM docs')->fetchColumn() > 0);

harness_finish();
