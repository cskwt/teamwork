<?php
/**
 * Twilio inbound WhatsApp webhook.
 * Page link is preferred; text replies still save as approve/revision notes.
 */
require_once __DIR__ . '/whatsapp-lib.php';

header('Content-Type: text/xml; charset=utf-8');

$fromRaw = (string)($_POST['From'] ?? '');
$from = twNormalizePhone($fromRaw);
$body = trim((string)($_POST['Body'] ?? ''));

$replyText = 'لاعتماد التصميم يرجى استخدام الرابط الذي أرسلناه لكم.';

try {
    $pending = twReadPending();
    $code = twExtractCode($body);
    $entry = null;
    if ($code && isset($pending['byCode'][$code])) $entry = $pending['byCode'][$code];
    if (!$entry && $from && isset($pending['byPhone'][$from])) $entry = $pending['byPhone'][$from];

    $url = '';
    if (is_array($entry)) {
        $url = (string)($entry['pageUrl'] ?? '');
        $token = (string)($entry['token'] ?? '');
        if ($url === '' && $token !== '') $url = twPageUrl($token);
    }

    if ($body !== '' && is_array($entry) && !empty($entry['orderId']) && !empty($entry['approvalId'])) {
        $status = twClassifyReply($body);
        $comment = $body;
        $comment = preg_replace('/CS-[A-Z0-9]{3,8}/i', '', $comment);
        $comment = trim(preg_replace('/^(موافق|موافقة|موافقه|اعتماد|تعديل|رفض)[:\s-]*/u', '', $comment));
        $applied = twApplyCustomerDecision(
            (string)$entry['orderId'],
            (string)$entry['approvalId'],
            $status,
            $comment !== '' ? $comment : $body,
            $from
        );
        if (!empty($applied['ok'])) {
            $replyText = $status === 'approved'
                ? 'تم استلام اعتمادكم للتصميم، شكراً لثقتكم. سنبدأ بالتنفيذ.'
                : 'تم استلام ملاحظات التعديل وسنعمل عليها ثم نعيد التصميم لكم للاعتماد.';
        } elseif ($url !== '') {
            $replyText = 'يرجى إرسال الاعتماد أو التعديل عبر هذا الرابط:' . "\n" . $url;
        }
    } elseif ($url !== '') {
        $replyText = 'لاعتماد التصميم أو طلب تعديل يرجى فتح هذا الرابط:' . "\n" . $url;
    }
} catch (Throwable $e) {
    $replyText = 'تعذر حفظ الرد حالياً، يرجى إعادة الإرسال بعد قليل.';
}

$safe = htmlspecialchars($replyText, ENT_XML1 | ENT_QUOTES, 'UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' . $safe . '</Message></Response>';
