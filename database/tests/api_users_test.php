<?php
/**
 * اختبار الدفعة 3: ملفات المستخدمين في MySQL (الصلاحيات + مزامنة جدول users فوراً)
 * والتسجيل الذاتي بدون Firebase (/api/v1/signup/*).
 *
 *   php database/tests/api_users_test.php <مسار-إعداد-قاعدة-الاختبار>
 */

declare(strict_types=1);

require __DIR__ . '/_harness.php';

$pdo = harness_start($argv[1] ?? '', 8103);
harness_user($pdo, 'ownerA', 'a@t.l', 'LAWYER', null, ['planId' => 'pro', 'officeName' => 'مكتب أ']);
harness_user($pdo, 'ownerB', 'b@t.l', 'LAWYER', null);
harness_user($pdo, 'secA', 'sa@t.l', 'SECRETARY', 'ownerA');
harness_user($pdo, 'trA', 'ta@t.l', 'TRAINEE', 'ownerA');
harness_user($pdo, 'memB', 'mb@t.l', 'SECRETARY', 'ownerB');
harness_user($pdo, 'clientA', 'ca@t.l', 'CLIENT', 'ownerA');
harness_user($pdo, 'admin', 'ad@t.l', 'SUPER_ADMIN', 'ALL');
harness_user($pdo, 'gone', 'gone@t.l', 'SECRETARY', 'ownerA', [], 'DISABLED');
foreach (['a@t.l' => 'A', 'b@t.l' => 'B', 'sa@t.l' => 'SA', 'ta@t.l' => 'TA', 'mb@t.l' => 'MB', 'ca@t.l' => 'CA', 'ad@t.l' => 'AD'] as $e => $jar) login($e, $jar);

$w = fn(string $jar, string $type, string $path, array $data = []) => call('POST', 'data/write', ['ops' => [['op' => $type, 'path' => $path] + ($type === 'delete' ? [] : ['data' => $data])]], $jar)[0];
$get = fn(string $jar, string $path) => call('POST', 'data/get', ['path' => $path], $jar);
$ids = function (string $jar) { $r = call('POST', 'data/query', ['path' => 'users'], $jar); $i = array_column($r[1]['docs'] ?? [], 'id'); sort($i); return [$r[0], $i]; };
$col = fn(string $sql, array $p = []) => (function () use ($pdo, $sql, $p) { $s = $pdo->prepare($sql); $s->execute($p); return $s->fetchColumn(); })();

echo "قراءة الملفات\n";
[$s, $list] = $ids('SA');
check('العضو يشوف فريق مكتبه ومالكه فقط', $s === 200 && $list === ['clientA', 'gone', 'ownerA', 'secA', 'trA'], $list);
check('مكتب ثاني ما يشوف فريقي', !in_array('secA', $ids('MB')[1], true));
check('قراءة ملف عضو مكتب ثاني ← 403', $get('MB', 'users/secA')[0] === 403);
check('عميل البوابة يقرأ ملفه', $get('CA', 'users/clientA')[0] === 200);
check('… وملف مكتبه', ($get('CA', 'users/ownerA')[1]['data']['officeName'] ?? '') === 'مكتب أ');
check('… لكن ما يقرأ ملف موظف', $get('CA', 'users/secA')[0] === 403);
check('… ولا يسرد المستخدمين', $ids('CA')[0] === 403);

echo "تعديل ملفي\n";
check('العضو يعدّل اسمه', $w('SA', 'update', 'users/secA', ['name' => 'سكرتير جديد', 'phone' => '0500']) === 200);
check('ما يرقّي نفسه (role)', $w('SA', 'update', 'users/secA', ['role' => 'LAWYER']) === 403);
check('ما ينقل نفسه لمكتب ثاني', $w('SA', 'update', 'users/secA', ['lawyerId' => 'ownerB']) === 403);
check('ما يغيّر حالته أو باقته', $w('SA', 'update', 'users/secA', ['status' => 'ACTIVE2']) === 403 && $w('SA', 'update', 'users/secA', ['plan' => 'PREMIUM']) === 403);
check('مالك المكتب يعدّل اسم مكتبه', $w('A', 'update', 'users/ownerA', ['officeName' => 'مكتب أ الجديد']) === 200);
check('… لكن ما يغيّر باقته أو اشتراكه', $w('A', 'update', 'users/ownerA', ['planId' => 'enterprise']) === 403
    && $w('A', 'update', 'users/ownerA', ['subscriptionExpiry' => '2099-01-01']) === 403);
check('مدير المنصة يجدد اشتراك المكتب', $w('AD', 'update', 'users/ownerA', ['subscriptionExpiry' => '2099-01-01', 'planId' => 'enterprise']) === 200);

echo "إدارة الفريق (التغيير ينطبق فوراً)\n";
[$s, $acc] = call('POST', 'accounts', ['email' => 'new@t.l', 'password' => 'secret123', 'name' => 'جديد', 'role' => 'TRAINEE'], 'A');
check('المالك ينشئ حساب متدرب', $s === 201, [$s, $acc]);
$newId = $acc['id'] ?? '';
check('… وملفه بنفس الدور والمكتب', $w('A', 'set', "users/$newId", ['name' => 'جديد', 'role' => 'TRAINEE', 'lawyerId' => 'ownerA', 'status' => 'ACTIVE']) === 200);
check('ملف بدور مختلف عن الحساب ← 403', $w('A', 'set', 'users/x' . substr($newId, 1), ['role' => 'TRAINEE', 'lawyerId' => 'ownerA']) === 403);
check('ملف لمعرّف بلا حساب ← 403', $w('A', 'create', 'users/nobodyx', ['role' => 'TRAINEE', 'lawyerId' => 'ownerA']) === 403);
check('مكتب ثاني ما ينشئ ملف في مكتبي', $w('B', 'create', 'users/nobody2', ['role' => 'TRAINEE', 'lawyerId' => 'ownerA']) === 403);
check('المالك ما يرقّي عضو لمالك مكتب', $w('A', 'update', 'users/trA', ['role' => 'LAWYER']) === 403);
check('ولا لمدير منصة', $w('A', 'update', 'users/trA', ['role' => 'SUPER_ADMIN']) === 403);
check('المالك يغيّر دور المتدرب لسكرتير', $w('A', 'update', 'users/trA', ['role' => 'SECRETARY']) === 200);
check('… وجدول الصلاحيات يتحدث فوراً', $col('SELECT role FROM users WHERE id = ?', ['trA']) === 'SECRETARY');
check('المتدرب السابق يقرأ العملاء الحين', call('POST', 'data/query', ['path' => 'clients'], 'TA')[0] === 200);
check('المالك يحوّله لعميل بوابة', $w('A', 'update', 'users/trA', ['role' => 'CLIENT']) === 200);
check('… فينقطع وصوله لبيانات المكتب فوراً (بدون انتظار دقيقة)', call('POST', 'data/query', ['path' => 'clients'], 'TA')[0] === 403);
check('المالك يعطّل السكرتير', $w('A', 'update', 'users/secA', ['status' => 'DISABLED']) === 200);
check('… فوراً ما يوصل لشي', call('POST', 'data/query', ['path' => 'clients'], 'SA')[0] === 403);
check('مكتب ثاني ما يعدّل عضو مكتبي', $w('B', 'update', 'users/secA', ['status' => 'ACTIVE']) === 403);
check('المالك ما يحذف نفسه', $w('A', 'delete', 'users/ownerA') === 403);
check('مكتب ثاني ما يحذف عضو مكتبي', $w('B', 'delete', 'users/trA') === 403);
check('المالك يحذف ملف عضو', $w('A', 'delete', "users/$newId") === 200);
check('… وحسابه يتعطل', $col('SELECT status FROM users WHERE id = ?', [$newId]) === 'DISABLED');
check('… وما يقدر يدخل', login('new@t.l', 'NEW')[0] === 403);

echo "التسجيل الذاتي (بدون Firebase)\n";
$profile = ['name' => 'أحمد', 'officeName' => 'مكتب أحمد للمحاماة', 'phone' => '+966٥٠٠٠٠٠٠٠٠', 'country' => 'SA', 'team' => ['lawyers' => 2, 'consultants' => 0, 'trainees' => 1, 'staff' => 1]];
$otp = fn(string $email) => $col('SELECT v FROM app_cache WHERE k = ?', ["test_otp:$email"]);
[$s, $r] = call('POST', 'signup/start', ['email' => 'Ahmed@New.Office', 'password' => 'mypass123', 'profile' => $profile], 'S1');
check('بدء التسجيل يرسل الرمز', $s === 200 && ($r['email'] ?? '') === 'ahmed@new.office' && strlen((string) $otp('ahmed@new.office')) === 6, [$s, $r]);
check('كلمة المرور ما تنحفظ نصاً', !str_contains((string) $col('SELECT password_hash FROM signup_pending WHERE email = ?', ['ahmed@new.office']), 'mypass123'));
check('الرمز ما ينحفظ نصاً', $col('SELECT code_hash FROM signup_pending WHERE email = ?', ['ahmed@new.office']) !== $otp('ahmed@new.office'));
[$s, $r] = call('POST', 'signup/resend', ['email' => 'ahmed@new.office'], 'S1');
check('إعادة الإرسال فوراً ← 429 انتظر', $s === 429 && ($r['code'] ?? '') === 'COOLDOWN', [$s, $r]);
$wrong = $otp('ahmed@new.office') === '000000' ? '111111' : '000000';
[$s, $r] = call('POST', 'signup/verify', ['email' => 'ahmed@new.office', 'code' => $wrong, 'password' => 'mypass123'], 'S1');
check('رمز غلط ← 400 ومتبقي 4 محاولات', $s === 400 && ($r['attemptsLeft'] ?? null) === 4, [$s, $r]);
[$s, $r] = call('POST', 'signup/verify', ['email' => 'ahmed@new.office', 'code' => $otp('ahmed@new.office'), 'password' => 'mypass123'], 'S1');
check('الرمز الصحيح ينشئ المكتب ويدخل', $s === 200 && ($r['user']['role'] ?? '') === 'LAWYER' && !empty($cookies['S1']['mz_session']), [$s, $r]);
$sid = $r['user']['id'] ?? '';
$prof = $get('S1', "users/$sid")[1]['data'] ?? [];
check('ملف المكتب: تجربة 14 يوم ورقم الجوال منظف', ($prof['subscriptionBilling'] ?? '') === 'trial' && ($prof['phone'] ?? '') === '+966500000000' && ($prof['selfSignup'] ?? false) === true, $prof);
check('إعدادات المكتب انحفظت', ($get('S1', "office_settings/$sid")[1]['data']['officeProfile']['name'] ?? '') === 'مكتب أحمد للمحاماة');
check('المكتب الجديد يضيف عميل (التجربة سارية)', $w('S1', 'create', 'clients/c1', ['lawyerId' => $sid, 'fullName' => 'عميل']) === 200);
check('الطلب المعلّق انحذف', (int) $col('SELECT COUNT(*) FROM signup_pending WHERE email = ?', ['ahmed@new.office']) === 0);
check('يدخل لاحقاً بكلمة مروره', login('ahmed@new.office', 'S2', 'mypass123')[0] === 200);
[$s, $r] = call('POST', 'signup/start', ['email' => 'ahmed@new.office', 'password' => 'other123', 'profile' => $profile], 'S3');
check('بريد مفعّل ← 409 ALREADY_ACTIVE', $s === 409 && ($r['code'] ?? '') === 'ALREADY_ACTIVE', [$s, $r]);
[$s, $r] = call('POST', 'signup/start', ['email' => 'gone@t.l', 'password' => 'secret123', 'profile' => $profile], 'S3');
check('حساب معطّل سابق ← 409 (ما يرجع بتجربة جديدة)', $s === 409, [$s, $r]);
// حساب قديم بلا ملف (تسجيل Firebase ما اكتمل) يكمل بنفس المعرّف
$pdo->exec("INSERT INTO users (id, email) VALUES ('oldpend', 'old@pend.ing')");
// جلسة قديمة لنفس المعرّف (مثلاً أحد دخل به قبل ما صاحب البريد يسجل) — ما ترث المكتب الجديد
$pdo->exec("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ('" . str_repeat('a', 64) . "', 'oldpend', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))");
call('POST', 'signup/start', ['email' => 'old@pend.ing', 'password' => 'newpass123', 'profile' => $profile], 'S4');
[$s, $r] = call('POST', 'signup/verify', ['email' => 'old@pend.ing', 'code' => $otp('old@pend.ing'), 'password' => 'newpass123'], 'S4');
check('تسجيل قديم ما اكتمل يكمل بنفس المعرّف', $s === 200 && ($r['user']['id'] ?? '') === 'oldpend', [$s, $r]);
check('… والجلسة القديمة لنفس المعرّف انحذفت', (int) $col('SELECT COUNT(*) FROM auth_sessions WHERE user_id = ? AND token_hash = ?', ['oldpend', str_repeat('a', 64)]) === 0);
// أحد يطلب رمزاً لبريد غيره بكلمة مروره أثناء ما صاحب البريد ينتظر الرمز
call('POST', 'signup/start', ['email' => 'vic@t.im', 'password' => 'victimpw1', 'profile' => $profile], 'V');
[$s] = call('POST', 'signup/start', ['email' => 'vic@t.im', 'password' => 'attackpw1', 'profile' => $profile], 'ATK');
check('ثغرة: طلب ثاني لنفس البريد ما يبدّل كلمة المرور', $s === 429 && password_verify('victimpw1', (string) $col('SELECT password_hash FROM signup_pending WHERE email = ?', ['vic@t.im'])), $s);
[$s, $r] = call('POST', 'signup/verify', ['email' => 'vic@t.im', 'code' => $otp('vic@t.im'), 'password' => 'attackpw1'], 'ATK');
check('… والرمز بكلمة مرور غير اللي انطلب بها ← 400 PASSWORD_MISMATCH', $s === 400 && ($r['code'] ?? '') === 'PASSWORD_MISMATCH', [$s, $r]);
[$s, $r] = call('POST', 'signup/verify', ['email' => 'vic@t.im', 'code' => $otp('vic@t.im'), 'password' => 'victimpw1'], 'V');
check('… وصاحب البريد يكمل بكلمة مروره', $s === 200 && login('vic@t.im', 'V2', 'victimpw1')[0] === 200, [$s, $r]);
call('POST', 'signup/start', ['email' => 'brute@x.y', 'password' => 'pass12345', 'profile' => $profile], 'S5');
for ($i = 0; $i < 5; $i++) [$s, $r] = call('POST', 'signup/verify', ['email' => 'brute@x.y', 'code' => '000001', 'password' => 'pass12345'], 'S5');
[$s, $r] = call('POST', 'signup/verify', ['email' => 'brute@x.y', 'code' => $otp('brute@x.y'), 'password' => 'pass12345'], 'S5');
check('بعد 5 محاولات غلط حتى الرمز الصحيح مرفوض', $s === 400 && ($r['code'] ?? '') === 'TOO_MANY_ATTEMPTS', [$s, $r]);
check('بيانات ناقصة ← 400', call('POST', 'signup/start', ['email' => 'x@y.z', 'password' => 'pass12345', 'profile' => ['name' => 'a']], 'S6')[0] === 400);

harness_finish();
