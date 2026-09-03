<?php
/**
 * Twilio inbound WhatsApp webhook — customer approve / reject artwork.
 * Set this URL on the WhatsApp sender: https://www.csapp.io/teamwork-api/whatsapp-webhook.php
 */
require_once __DIR__ . '/whatsapp-lib.php';

header('Content-Type: text/xml; charset=utf-8');

$fromRaw = (string)($_POST['From'] ?? '');
$body = trim((string)($_POST['Body'] ?? ''));
$from = twNormalizePhone($fromRaw);

$replyText = 'تم استلام رسالتكم، شكراً لكم.';
$applied = false;

try {
    $pending = twReadPending();
    $code = twExtractCode($body);
    $entry = null;
    if ($code && isset($pending['byCode'][$code])) $entry = $pending['byCode'][$code];
    if (!$entry && $from && isset($pending['byPhone'][$from])) $entry = $pending['byPhone'][$from];

    if ($entry && !empty($entry['orderId']) && !empty($entry['approvalId'])) {
        $status = twClassifyReply($body);
        $now = gmdate('c');
        $state = twLoadState();
        if ($state && isset($state['orders']) && is_array($state['orders'])) {
            $comment = $body;
            $comment = preg_replace('/CS-[A-Z0-9]{3,8}/i', '', $comment);
            $comment = trim(preg_replace('/^(موافق|موافقة|موافقه|اعتماد|تعديل|رفض)[:\s-]*/u', '', $comment));
            foreach ($state['orders'] as &$order) {
                if (($order['id'] ?? '') !== $entry['orderId']) continue;
                $list = isset($order['artworkApprovals']) && is_array($order['artworkApprovals'])
                    ? $order['artworkApprovals'] : [];
                $found = false;
                foreach ($list as &$ap) {
                    if (($ap['id'] ?? '') !== $entry['approvalId']) continue;
                    $ap['status'] = $status;
                    $ap['customerComment'] = $comment !== '' ? $comment : ($status === 'approved' ? 'موافق' : $body);
                    $ap['repliedAt'] = $now;
                    $found = true;
                    break;
                }
                unset($ap);
                if (!$found) {
                    $list[] = [
                        'id' => $entry['approvalId'],
                        'status' => $status,
                        'customerComment' => $comment ?: $body,
                        'repliedAt' => $now,
                        'customerPhone' => $from,
                    ];
                }
                $order['artworkApprovals'] = $list;
                $order['updatedAt'] = $now;

                $client = (string)($order['clientName'] ?? '');
                $num = (string)($order['orderNumber'] ?? '');
                $deptId = (string)($order['departmentId'] ?? '');
                $sentBy = '';
                foreach ($list as $apRow) {
                    if (($apRow['id'] ?? '') === $entry['approvalId']) {
                        $sentBy = (string)($apRow['sentBy'] ?? '');
                        break;
                    }
                }
                $msg = $status === 'approved'
                    ? "اعتمد العميل تصميم طلبية {$client} — رقم {$num}"
                    : "العميل طلب تعديلاً على تصميم طلبية {$client} — رقم {$num}";
                $receivers = [];
                if ($sentBy !== '') $receivers[$sentBy] = true;
                foreach (($state['users'] ?? []) as $u) {
                    if (!empty($u['deletedAt'])) continue;
                    $uid = (string)($u['id'] ?? '');
                    if ($uid === '') continue;
                    $depts = [];
                    if (!empty($u['departmentIds']) && is_array($u['departmentIds'])) $depts = $u['departmentIds'];
                    elseif (!empty($u['departmentId'])) $depts = [$u['departmentId']];
                    $assigned = $order['assignedUsers'] ?? [];
                    if (in_array($deptId, $depts, true) || in_array($uid, $assigned, true) || ($u['role'] ?? '') === 'admin') {
                        $receivers[$uid] = true;
                    }
                }
                $notifs = isset($state['notifications']) && is_array($state['notifications']) ? $state['notifications'] : [];
                foreach (array_keys($receivers) as $uid) {
                    $notifs[] = [
                        'id' => 'wa-' . bin2hex(random_bytes(6)),
                        'type' => 'approval',
                        'userId' => $uid,
                        'orderId' => $order['id'],
                        'orderNumber' => $num,
                        'clientName' => $client,
                        'departmentId' => $deptId,
                        'actorName' => 'العميل',
                        'message' => $msg,
                        'commentText' => $comment !== '' ? $comment : ($status === 'approved' ? 'موافق' : $body),
                        'createdAt' => $now,
                        'read' => false,
                    ];
                }
                $state['notifications'] = $notifs;
                $applied = true;
                $replyText = $status === 'approved'
                    ? 'تم استلام اعتمادكم للتصميم، شكراً لثقتكم. سنبدأ بالتنفيذ.'
                    : 'تم استلام ملاحظات التعديل وسنعمل عليها ثم نعيد التصميم لكم للاعتماد.';
                break;
            }
            unset($order);
            if ($applied) twSaveState($state);
        }
    }
} catch (Throwable $e) {
    $replyText = 'تعذر حفظ الرد حالياً، يرجى إعادة الإرسال بعد قليل.';
}

$safe = htmlspecialchars($replyText, ENT_XML1 | ENT_QUOTES, 'UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' . $safe . '</Message></Response>';
