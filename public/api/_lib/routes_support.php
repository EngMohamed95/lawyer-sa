<?php
/**
 * POST /api/v1/support/reply — رد على تذكرة دعم: يضيف الرسالة ويحدّث التذكرة بمعاملة وحدة.
 * بديل writeBatch + increment في الواجهة (القاعدة newReply() في firestore.rules).
 */

declare(strict_types=1);

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/store_rules.php';
require_once __DIR__ . '/routes_data.php';

function route_support_reply(): void {
    $u = require_fresh_member();
    $b = data_body();
    $ticketId = (string) ($b->ticketId ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $ticketId)) fail(422, 'التذكرة غير صحيحة.', 'VALIDATION', ['field' => 'ticketId']);
    $super = is_super_admin($u);
    $me = (string) $u['id'];

    $msg = (object) [
        'body' => is_string($b->body ?? null) ? trim($b->body) : '',
        'senderId' => $me,
        'senderName' => is_string($b->senderName ?? null) ? $b->senderName : '',
        'isAdmin' => $super,
        'createdAt' => rule_now(),
        'attachments' => $b->attachments ?? [],
    ];
    rule_str($msg, 'body', 0, 10000);
    rule_str($msg, 'senderName', 0, 200);
    rule_support_attachments($msg->attachments, $ticketId, $me);
    if ($msg->body === '' && count($msg->attachments) === 0) rule_invalid('body');

    $pdo = db();
    $pdo->beginTransaction();
    register_shutdown_function(function () use ($pdo): void { if ($pdo->inTransaction()) $pdo->rollBack(); });
    $ticket = store_row('supportTickets', '', $ticketId, true);
    // طرفا التذكرة فقط، والتذكرة مفتوحة
    if ($ticket === null || (!$super && ($ticket['data']->createdBy ?? null) !== $me)) store_forbidden();
    if (in_array($ticket['data']->status ?? '', ['CLOSED', 'RESOLVED'], true)) fail(409, 'التذكرة مغلقة. أعد فتحها للرد.', 'TICKET_CLOSED');

    $messageId = new_id();
    $t = $ticket['data'];
    $t->lastMessageId = $messageId;
    $t->messageCount = (int) ($t->messageCount ?? 0) + 1;
    $t->status = $super ? 'WAITING' : 'OPEN';
    $t->lastReplyBy = $super ? 'ADMIN' : 'USER';
    $t->updatedAt = $msg->createdAt;
    // الرسالة تحمل مكتب التذكرة — عشان حذف المكتب (trial-cleanup) يلقاها
    if (isset($t->lawyerId)) $msg->lawyerId = $t->lawyerId;

    store_put(['collection' => 'messages', 'parent_path' => "supportTickets/$ticketId", 'id' => $messageId], false, $msg);
    store_put(['collection' => 'supportTickets', 'parent_path' => '', 'id' => $ticketId], true, $t);
    $pdo->commit();
    respond(200, ['id' => $messageId]);
}
