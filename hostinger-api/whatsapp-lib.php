<?php
/**
 * Shared Twilio WhatsApp helpers for artwork approval.
 * Upload next to api.php as: public_html/teamwork-api/whatsapp-lib.php
 */
const TW_API_KEY = 'tw_Cs9kWt2026xTeAmWoRk';
const TW_DEFAULT_FROM = 'whatsapp:+18387333651';
const TW_CONFIG_FILE = __DIR__ . '/whatsapp-config.json';
const TW_PENDING_FILE = __DIR__ . '/whatsapp-pending.json';

function twDb(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO(
        'mysql:host=localhost;dbname=u805159754_tw;charset=utf8mb4',
        'u805159754_tw',
        'Teamwork@2026',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    return $pdo;
}

const TW_TEMPLATE_NAME = 'cs_artwork_link';
const TW_PAGE_BASE = 'https://teamwork.csapp.io/approve/';

function twWindowHelp(): string {
    return 'واتساب رفض الرسالة (خطأ 63016): هذا الرقم لم يراسلكم خلال 24 ساعة. '
        . 'من نفس الهاتف أرسل أي رسالة إلى +18387333651 ثم أعد الإرسال من هنا. '
        . 'إرسال العملاء الجدد مباشرة يعمل بعد اعتماد قالب واتساب (الإعدادات ← إنشاء قالب الاعتماد).';
}

function twReadConfig(): array {
    $defaults = [
        'accountSid' => '',
        'authToken' => '',
        'from' => TW_DEFAULT_FROM,
        'contentSid' => '',
        'templateStatus' => '',
        'templateName' => '',
    ];
    if (!is_file(TW_CONFIG_FILE)) return $defaults;
    $raw = @file_get_contents(TW_CONFIG_FILE);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) return $defaults;
    return array_merge($defaults, $data);
}

function twWriteConfig(array $cfg): bool {
    $prev = twReadConfig();
    $payload = json_encode([
        'accountSid' => (string)($cfg['accountSid'] ?? $prev['accountSid']),
        'authToken' => (string)($cfg['authToken'] ?? $prev['authToken']),
        'from' => (string)($cfg['from'] ?? $prev['from'] ?? TW_DEFAULT_FROM),
        'contentSid' => (string)($cfg['contentSid'] ?? $prev['contentSid'] ?? ''),
        'templateStatus' => (string)($cfg['templateStatus'] ?? $prev['templateStatus'] ?? ''),
        'templateName' => (string)($cfg['templateName'] ?? $prev['templateName'] ?? ''),
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return @file_put_contents(TW_CONFIG_FILE, $payload) !== false;
}

function twMaskSid(string $sid): string {
    $sid = trim($sid);
    if (strlen($sid) < 8) return $sid ? '****' : '';
    return substr($sid, 0, 4) . str_repeat('*', max(0, strlen($sid) - 8)) . substr($sid, -4);
}

function twNormalizePhone(string $raw): string {
    $digits = preg_replace('/[^\d+]/', '', trim($raw));
    $digits = preg_replace('/^whatsapp:/i', '', $digits);
    if (str_starts_with($digits, '00')) $digits = '+' . substr($digits, 2);
    if (str_starts_with($digits, '+')) {
        $rest = preg_replace('/\D/', '', substr($digits, 1));
        return $rest ? ('+' . $rest) : '';
    }
    $digits = preg_replace('/\D/', '', $digits);
    if ($digits === '') return '';
    if (strlen($digits) === 8) return '+965' . $digits;
    if (strlen($digits) === 11 && str_starts_with($digits, '965')) return '+' . $digits;
    if (strlen($digits) >= 10 && strlen($digits) <= 15) return '+' . $digits;
    return '';
}

function twReadPending(): array {
    if (!is_file(TW_PENDING_FILE)) return ['byPhone' => [], 'byCode' => [], 'byToken' => []];
    $raw = @file_get_contents(TW_PENDING_FILE);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) return ['byPhone' => [], 'byCode' => [], 'byToken' => []];
    return [
        'byPhone' => is_array($data['byPhone'] ?? null) ? $data['byPhone'] : [],
        'byCode' => is_array($data['byCode'] ?? null) ? $data['byCode'] : [],
        'byToken' => is_array($data['byToken'] ?? null) ? $data['byToken'] : [],
    ];
}

function twWritePending(array $pending): void {
    @file_put_contents(TW_PENDING_FILE, json_encode($pending, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function twNewToken(): string {
    return bin2hex(random_bytes(12));
}

function twPageUrl(string $token): string {
    return TW_PAGE_BASE . $token;
}

function twBuildLinkMessage(string $name, string $orderNum, string $pageUrl): string {
    $name = $name !== '' ? $name : 'عميلنا الكريم';
    $orderNum = $orderNum !== '' ? $orderNum : '—';
    return "السلام عليكم {$name}،\nتصميم طلبية رقم {$orderNum} جاهز للمراجعة والاعتماد. اضغط الرابط:\n{$pageUrl}\nCreative Solutions";
}

function twRegisterPending(string $phone, string $orderId, string $approvalId, string $code, array $extra = []): void {
    $pending = twReadPending();
    $entry = array_merge([
        'orderId' => $orderId,
        'approvalId' => $approvalId,
        'trackingCode' => $code,
        'at' => gmdate('c'),
    ], $extra);
    $pending['byPhone'][$phone] = $entry;
    if ($code !== '') $pending['byCode'][strtoupper($code)] = $entry;
    $token = (string)($entry['token'] ?? '');
    if ($token !== '') $pending['byToken'][$token] = $entry;
    twWritePending($pending);
}

function twIsWindowError(array $data, string $text = ''): bool {
    $code = (string)($data['code'] ?? $data['error_code'] ?? '');
    if ($code === '63016' || $code === '63031') return true;
    $blob = strtolower($text . ' ' . json_encode($data, JSON_UNESCAPED_UNICODE));
    return str_contains($blob, '63016') || str_contains($blob, 'outside messaging window');
}

function twHttpBasic(string $url, string $sid, string $token, string $method = 'GET', $body = null, array $headers = []): array {
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD => $sid . ':' . $token,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CUSTOMREQUEST => $method,
    ];
    if ($headers) $opts[CURLOPT_HTTPHEADER] = $headers;
    if ($body !== null) $opts[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) return ['ok' => false, 'http' => $http, 'error' => $err ?: 'curl failed', 'data' => null];
    $data = json_decode($raw, true);
    return [
        'ok' => $http >= 200 && $http < 300,
        'http' => $http,
        'error' => $err,
        'data' => is_array($data) ? $data : null,
        'raw' => $raw,
    ];
}

function twPostMessage(array $post): array {
    $cfg = twReadConfig();
    $sid = trim((string)$cfg['accountSid']);
    $token = trim((string)$cfg['authToken']);
    $from = trim((string)($cfg['from'] ?: TW_DEFAULT_FROM));
    if ($sid === '' || $token === '') {
        return ['ok' => false, 'error' => 'Twilio is not configured. Add Account SID and Auth Token in Settings.'];
    }
    if (!str_starts_with($from, 'whatsapp:')) $from = 'whatsapp:' . $from;
    $post['From'] = $from;
    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages.json';
    $res = twHttpBasic($url, $sid, $token, 'POST', http_build_query($post));
    $data = $res['data'] ?? [];
    if ($res['ok'] && !empty($data['sid'])) {
        return ['ok' => true, 'sid' => $data['sid'], 'status' => $data['status'] ?? '', 'data' => $data];
    }
    $msg = is_array($data) ? (string)($data['message'] ?? $data['error_message'] ?? ('HTTP ' . $res['http'])) : ('HTTP ' . $res['http']);
    $code = is_array($data) ? (string)($data['code'] ?? '') : '';
    return ['ok' => false, 'error' => trim($code . ' ' . $msg), 'code' => $code, 'twilio' => $data];
}

function twFetchMessage(string $msgSid): array {
    $cfg = twReadConfig();
    $sid = trim((string)$cfg['accountSid']);
    $token = trim((string)$cfg['authToken']);
    if ($sid === '' || $token === '' || $msgSid === '') return [];
    $url = 'https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages/' . rawurlencode($msgSid) . '.json';
    $res = twHttpBasic($url, $sid, $token);
    return is_array($res['data'] ?? null) ? $res['data'] : [];
}

function twAwaitMessage(string $msgSid): array {
    $last = [];
    for ($i = 0; $i < 12; $i++) {
        if ($i > 0) usleep(900000);
        $last = twFetchMessage($msgSid);
        $status = (string)($last['status'] ?? '');
        $err = (string)($last['error_code'] ?? '');
        if ($err !== '') return $last;
        if (in_array($status, ['delivered', 'read', 'failed', 'undelivered', 'canceled'], true)) {
            return $last;
        }
    }
    return $last;
}

function twSendSession(string $to, string $body, string $mediaUrl = ''): array {
    if (!str_starts_with($to, 'whatsapp:')) $to = 'whatsapp:' . $to;
    $post = ['To' => $to, 'Body' => $body];
    if ($mediaUrl !== '') $post['MediaUrl'] = $mediaUrl;
    $sent = twPostMessage($post);
    if (!$sent['ok'] || empty($sent['sid'])) return $sent;
    $final = twAwaitMessage((string)$sent['sid']);
    $err = (string)($final['error_code'] ?? '');
    $status = (string)($final['status'] ?? '');
    $msg = (string)($final['error_message'] ?? $sent['error'] ?? 'undelivered');
    if ($err !== '' || in_array($status, ['failed', 'undelivered', 'canceled'], true) || twIsWindowError($final, $msg)) {
        return [
            'ok' => false,
            'sid' => $sent['sid'],
            'error' => twIsWindowError($final, $msg) ? twWindowHelp() : trim($err . ' ' . $msg),
            'code' => $err !== '' ? $err : (twIsWindowError($final, $msg) ? '63016' : ''),
            'twilio' => $final,
        ];
    }
    if (!in_array($status, ['delivered', 'read', 'sent'], true)) {
        return ['ok' => false, 'sid' => $sent['sid'], 'error' => twWindowHelp(), 'code' => '63016', 'twilio' => $final];
    }
    return ['ok' => true, 'sid' => $sent['sid'], 'via' => 'session'];
}

function twSendTemplate(string $to, string $contentSid, array $variables): array {
    if (!str_starts_with($to, 'whatsapp:')) $to = 'whatsapp:' . $to;
    $sent = twPostMessage([
        'To' => $to,
        'ContentSid' => $contentSid,
        'ContentVariables' => json_encode($variables, JSON_UNESCAPED_UNICODE),
    ]);
    if (!$sent['ok'] || empty($sent['sid'])) return $sent;
    $final = twAwaitMessage((string)$sent['sid']);
    $err = (string)($final['error_code'] ?? '');
    $status = (string)($final['status'] ?? '');
    if ($err !== '' || in_array($status, ['failed', 'undelivered', 'canceled'], true)) {
        $msg = (string)($final['error_message'] ?? $sent['error'] ?? 'undelivered');
        return [
            'ok' => false,
            'sid' => $sent['sid'],
            'error' => trim($err . ' ' . $msg),
            'code' => $err,
            'twilio' => $final,
        ];
    }
    return ['ok' => true, 'sid' => $sent['sid'], 'via' => 'template'];
}

function twContentApi(string $method, string $path, ?array $json = null): array {
    $cfg = twReadConfig();
    $sid = trim((string)$cfg['accountSid']);
    $token = trim((string)$cfg['authToken']);
    if ($sid === '' || $token === '') {
        return ['ok' => false, 'error' => 'Twilio is not configured', 'data' => null];
    }
    $url = 'https://content.twilio.com/v1' . $path;
    $headers = ['Content-Type: application/json'];
    $body = $json !== null ? json_encode($json, JSON_UNESCAPED_UNICODE) : null;
    $res = twHttpBasic($url, $sid, $token, $method, $body, $headers);
    if (!$res['ok']) {
        $data = $res['data'] ?? [];
        $msg = is_array($data) ? (string)($data['message'] ?? $data['error_message'] ?? ('HTTP ' . $res['http'])) : ('HTTP ' . $res['http']);
        return ['ok' => false, 'error' => $msg, 'data' => $data, 'http' => $res['http']];
    }
    return ['ok' => true, 'data' => $res['data']];
}

function twTemplateApprovalStatus(string $contentSid): string {
    $res = twContentApi('GET', '/Content/' . rawurlencode($contentSid) . '/ApprovalRequests');
    $data = $res['data'] ?? [];
    $wa = is_array($data['whatsapp'] ?? null) ? $data['whatsapp'] : $data;
    $status = strtolower((string)($wa['status'] ?? $data['status'] ?? ''));
    return $status;
}

function twSubmitWhatsAppApproval(string $contentSid): array {
    return twContentApi('POST', '/Content/' . rawurlencode($contentSid) . '/ApprovalRequests/whatsapp', [
        'name' => TW_TEMPLATE_NAME,
        'category' => 'UTILITY',
        'allow_category_change' => true,
    ]);
}

function twFinishTemplate(string $contentSid, bool $created = false, bool $existed = false): array {
    $status = twTemplateApprovalStatus($contentSid);
    $approvalError = null;
    if (!in_array($status, ['approved', 'pending', 'received', 'submitted', 'in_review'], true)) {
        $approval = twSubmitWhatsAppApproval($contentSid);
        if ($approval['ok']) {
            $wa = $approval['data']['whatsapp'] ?? $approval['data'] ?? [];
            $status = strtolower((string)($wa['status'] ?? 'received')) ?: 'pending';
        } else {
            $approvalError = $approval['error'] ?? 'تعذر تقديم القالب لموافقة واتساب';
            if ($status === '') $status = 'submit_failed';
        }
    }
    $cfg = twReadConfig();
    twWriteConfig(array_merge($cfg, [
        'contentSid' => $contentSid,
        'templateStatus' => $status,
        'templateName' => TW_TEMPLATE_NAME,
    ]));
    return [
        'ok' => true,
        'contentSid' => $contentSid,
        'status' => $status,
        'created' => $created,
        'existed' => $existed,
        'approvalError' => $approvalError,
    ];
}

function twEnsureArtworkTemplate(): array {
    $list = twContentApi('GET', '/Content?PageSize=50');
    $contents = is_array($list['data']['contents'] ?? null) ? $list['data']['contents'] : [];
    foreach ($contents as $item) {
        if (($item['friendly_name'] ?? '') === TW_TEMPLATE_NAME && !empty($item['sid'])) {
            return twFinishTemplate((string)$item['sid'], false, true);
        }
    }

    $body = "السلام عليكم {{1}}،\n"
        . "تصميم طلبية رقم {{2}} جاهز للمراجعة والاعتماد. اضغط الرابط:\n"
        . "{{3}}\n"
        . "Creative Solutions";

    $created = twContentApi('POST', '/Content', [
        'friendly_name' => TW_TEMPLATE_NAME,
        'language' => 'ar',
        'variables' => [
            '1' => 'العميل',
            '2' => '4521',
            '3' => 'https://teamwork.csapp.io/approve/sampletoken12ab',
        ],
        'types' => [
            'twilio/text' => [
                'body' => $body,
            ],
        ],
    ]);
    if (!$created['ok'] || empty($created['data']['sid'])) {
        return ['ok' => false, 'error' => $created['error'] ?? 'تعذر إنشاء قالب واتساب في Twilio'];
    }
    return twFinishTemplate((string)$created['data']['sid'], true);
}

function twSendWhatsApp(string $toE164, string $body, string $mediaUrl = '', array $meta = []): array {
    $cfg = twReadConfig();
    $contentSid = trim((string)($cfg['contentSid'] ?? ''));
    $templateStatus = strtolower((string)($cfg['templateStatus'] ?? ''));
    if ($contentSid !== '') {
        $live = strtolower(twTemplateApprovalStatus($contentSid));
        if ($live !== '' && $live !== $templateStatus) {
            $templateStatus = $live;
            twWriteConfig(array_merge($cfg, [
                'templateStatus' => $live,
                'contentSid' => $contentSid,
                'templateName' => TW_TEMPLATE_NAME,
            ]));
        } elseif ($live !== '') {
            $templateStatus = $live;
        }
    }
    $templateReady = $contentSid !== '' && $templateStatus === 'approved';

    $name = trim((string)($meta['clientName'] ?? 'عميلنا الكريم')) ?: 'عميلنا الكريم';
    $orderNum = trim((string)($meta['orderNumber'] ?? '—')) ?: '—';
    $token = trim((string)($meta['token'] ?? ''));
    $pageUrl = $token !== '' ? twPageUrl($token) : trim((string)($meta['pageUrl'] ?? ''));
    $vars = [
        '1' => $name,
        '2' => $orderNum,
        '3' => $pageUrl !== '' ? $pageUrl : 'https://teamwork.csapp.io/approve',
    ];

    if ($templateReady) {
        $tpl = twSendTemplate($toE164, $contentSid, $vars);
        if ($tpl['ok']) return $tpl;
    }

    $session = twSendSession($toE164, $body, '');
    if ($session['ok']) return $session;

    $window = twIsWindowError($session['twilio'] ?? [], (string)($session['error'] ?? ''));
    if ($window && $contentSid !== '' && $templateStatus === 'approved') {
        $tpl = twSendTemplate($toE164, $contentSid, $vars);
        if ($tpl['ok']) return $tpl;
        return ['ok' => false, 'error' => twWindowHelp() . ' حالة القالب الحالية: ' . ($templateStatus ?: 'بانتظار الموافقة')];
    }
    if ($window) {
        return ['ok' => false, 'error' => twWindowHelp(), 'code' => '63016'];
    }
    return $session;
}

function twPublicPage(string $token): ?array {
    $token = preg_replace('/[^a-fA-F0-9]/', '', $token);
    if (strlen($token) < 16) return null;
    $pending = twReadPending();
    $entry = $pending['byToken'][$token] ?? null;
    if (!is_array($entry)) return null;

    $out = [
        'clientName' => (string)($entry['clientName'] ?? ''),
        'orderNumber' => (string)($entry['orderNumber'] ?? ''),
        'title' => (string)($entry['title'] ?? ''),
        'imageUrl' => (string)($entry['imageUrl'] ?? ''),
        'status' => 'sent',
        'comment' => '',
        'customerImageUrl' => '',
        'staffReplies' => [],
    ];
    $state = twLoadState();
    $orderId = (string)($entry['orderId'] ?? '');
    $approvalId = (string)($entry['approvalId'] ?? '');
    if ($state && $orderId !== '') {
        foreach (($state['orders'] ?? []) as $order) {
            if ((string)($order['id'] ?? '') !== $orderId) continue;
            if (!empty($order['clientName'])) $out['clientName'] = (string)$order['clientName'];
            if (!empty($order['orderNumber'])) $out['orderNumber'] = (string)$order['orderNumber'];
            if (!empty($order['title'])) $out['title'] = (string)$order['title'];
            foreach (($order['artworkApprovals'] ?? []) as $ap) {
                if ((string)($ap['id'] ?? '') !== $approvalId) continue;
                $out['status'] = (string)($ap['status'] ?? 'sent');
                $out['comment'] = (string)($ap['customerComment'] ?? '');
                if (!empty($ap['imageUrl'])) $out['imageUrl'] = (string)$ap['imageUrl'];
                if (!empty($ap['customerImageUrl'])) $out['customerImageUrl'] = (string)$ap['customerImageUrl'];
                $out['staffReplies'] = isset($ap['staffReplies']) && is_array($ap['staffReplies']) ? $ap['staffReplies'] : [];
                break;
            }
            break;
        }
    }
    return $out;
}

function twSafeCustomerImageUrl(string $url): string {
    $url = trim($url);
    if ($url === '') return '';
    if (!preg_match('#^https://www\.csapp\.io/teamwork-api/uploads/[a-zA-Z0-9._-]+$#', $url)) return '';
    return $url;
}

function twSavePublicImage(string $id, string $name, string $mime, string $binary): array {
    $max = 8 * 1024 * 1024;
    if (strlen($binary) > $max) return ['ok' => false, 'error' => 'الصورة أكبر من 8 ميغابايت'];
    $ext = '';
    $mime = strtolower(trim($mime));
    $byMime = [
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/pjpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];
    if (isset($byMime[$mime])) $ext = $byMime[$mime];
    if ($ext === '') {
        $fromName = strtolower((string)pathinfo($name, PATHINFO_EXTENSION));
        if ($fromName === 'jpeg') $fromName = 'jpg';
        if (in_array($fromName, ['jpg', 'png', 'webp', 'gif'], true)) $ext = $fromName;
    }
    if ($ext === '') return ['ok' => false, 'error' => 'يُسمح برفع صور فقط (jpg, png, webp)'];
    $dir = __DIR__ . '/uploads';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return ['ok' => false, 'error' => 'تعذر حفظ الصورة على السيرفر'];
    }
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $id);
    if ($id === '') $id = bin2hex(random_bytes(8));
    $safe = 'cnote-' . $id . '.' . $ext;
    if (@file_put_contents($dir . '/' . $safe, $binary) === false) {
        return ['ok' => false, 'error' => 'تعذر حفظ الصورة'];
    }
    @chmod($dir . '/' . $safe, 0644);
    return ['ok' => true, 'url' => 'https://www.csapp.io/teamwork-api/uploads/' . $safe];
}

function twPatchApprovalDecision(array &$ap, string $status, string $comment, string $imageUrl, string $now): void {
    $ap['status'] = $status;
    $ap['customerComment'] = $comment !== '' ? $comment : ($status === 'approved' ? 'موافق' : $comment);
    $ap['repliedAt'] = $now;
    if ($imageUrl !== '') $ap['customerImageUrl'] = $imageUrl;
}

function twApplyCustomerDecision(string $orderId, string $approvalId, string $status, string $comment, string $phone = '', string $imageUrl = ''): array {
    if (!in_array($status, ['approved', 'rejected'], true)) {
        return ['ok' => false, 'error' => 'invalid status'];
    }
    $comment = trim($comment);
    $imageUrl = twSafeCustomerImageUrl($imageUrl);
    if ($status === 'rejected' && $comment === '') {
        return ['ok' => false, 'error' => 'يرجى كتابة ملاحظات التعديل'];
    }
    $now = gmdate('c');
    $state = twLoadState();
    if (!$state || !isset($state['orders']) || !is_array($state['orders'])) {
        return ['ok' => false, 'error' => 'تعذر حفظ الرد حالياً'];
    }
    $applied = false;
    $already = false;
    foreach ($state['orders'] as &$order) {
        if ((string)($order['id'] ?? '') !== $orderId) continue;
        $list = isset($order['artworkApprovals']) && is_array($order['artworkApprovals'])
            ? $order['artworkApprovals'] : [];
        $deletedIds = isset($order['deletedArtworkApprovalIds']) && is_array($order['deletedArtworkApprovalIds'])
            ? $order['deletedArtworkApprovalIds'] : [];
        if (in_array($approvalId, $deletedIds, true)) {
            return ['ok' => false, 'error' => 'تم إلغاء رابط الاعتماد'];
        }
        $found = false;
        foreach ($list as &$ap) {
            if ((string)($ap['id'] ?? '') !== $approvalId) continue;
            $prev = (string)($ap['status'] ?? 'sent');
            if ($prev === 'approved' || $prev === 'rejected') {
                $already = true;
                $found = true;
                break;
            }
            twPatchApprovalDecision($ap, $status, $comment, $imageUrl, $now);
            $found = true;
            break;
        }
        unset($ap);
        if ($already && $comment === '') {
            return ['ok' => true, 'already' => true, 'status' => $status];
        }
        if (!$found) {
            for ($i = count($list) - 1; $i >= 0; $i--) {
                $st = (string)($list[$i]['status'] ?? 'sent');
                $rowId = (string)($list[$i]['id'] ?? '');
                if ($st !== 'sent' || ($rowId !== '' && in_array($rowId, $deletedIds, true))) continue;
                twPatchApprovalDecision($list[$i], $status, $comment, $imageUrl, $now);
                $found = true;
                break;
            }
        }
        if (!$found) {
            return ['ok' => false, 'error' => 'رابط الاعتماد غير صالح'];
        }
        $order['artworkApprovals'] = $list;
        $order['updatedAt'] = $now;

        $note = $status === 'approved'
            ? 'تم اعتماد التصميم من العميل.'
            : ('ملاحظات العميل على التصميم: ' . ($comment !== '' ? $comment : 'مطلوب تعديل'));
        if ($imageUrl !== '') $note .= "\n" . $imageUrl;
        $comments = isset($order['comments']) && is_array($order['comments']) ? $order['comments'] : [];
        $comments[] = [
            'id' => 'wa-c-' . bin2hex(random_bytes(6)),
            'orderId' => $orderId,
            'userId' => 'customer',
            'text' => $note,
            'createdAt' => $now,
        ];
        $order['comments'] = $comments;

        $history = isset($order['history']) && is_array($order['history']) ? $order['history'] : [];
        $history[] = [
            'id' => 'wa-h-' . bin2hex(random_bytes(6)),
            'orderId' => $orderId,
            'userId' => 'customer',
            'action' => $status === 'approved' ? 'اعتماد التصميم' : 'طلب تعديل على التصميم',
            'toValue' => $comment !== '' ? $comment : ($status === 'approved' ? 'موافق' : ''),
            'timestamp' => $now,
        ];
        $order['history'] = $history;

        $client = (string)($order['clientName'] ?? '');
        $num = (string)($order['orderNumber'] ?? '');
        $deptId = (string)($order['departmentId'] ?? '');
        $sentBy = '';
        foreach ($list as $apRow) {
            if ((string)($apRow['id'] ?? '') === $approvalId) {
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
                'commentText' => $comment !== '' ? $comment : ($status === 'approved' ? 'موافق' : ''),
                'createdAt' => $now,
                'read' => false,
            ];
        }
        $state['notifications'] = $notifs;
        $applied = true;
        break;
    }
    unset($order);
    if (!$applied) return ['ok' => false, 'error' => 'الطلبية غير موجودة بعد على السيرفر. أعد المحاولة بعد ثوانٍ.'];
    if (!twSaveState($state)) return ['ok' => false, 'error' => 'تعذر حفظ الرد'];
    return ['ok' => true, 'already' => false, 'status' => $status];
}

function twLoadState(): ?array {
    $stmt = twDb()->query('SELECT state_json FROM app_state WHERE id = 1');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || empty($row['state_json'])) return null;
    $data = json_decode($row['state_json'], true);
    $GLOBALS['tw_loaded_state'] = is_array($data) ? $data : null;
    return is_array($data) ? $data : null;
}

/** Apply only changes made by this request, retaining concurrent app edits. */
function twMergeStatePatch($base, $changed, $current) {
    if ($base === $changed) return $current;
    if (!is_array($base) || !is_array($changed) || !is_array($current)) return $changed;
    $isList = static function (array $v): bool {
        return $v === [] || array_keys($v) === range(0, count($v) - 1);
    };
    if ($isList($base) && $isList($changed) && $isList($current)) {
        foreach (array_merge($base, $changed, $current) as $row) {
            if (!is_array($row) || !isset($row['id'])) return $changed;
        }
        $before = []; $after = []; $result = [];
        foreach ($base as $row) $before[$row['id']] = $row;
        foreach ($changed as $row) $after[$row['id']] = $row;
        foreach ($current as $row) $result[$row['id']] = $row;
        foreach ($before as $id => $row) {
            if (!isset($after[$id])) unset($result[$id]);
        }
        foreach ($after as $id => $row) {
            if (isset($before[$id]) && $before[$id] === $row) continue;
            // A concurrent permanent deletion must not be recreated by a reply.
            if (isset($before[$id]) && !isset($result[$id])) continue;
            if (!empty($result[$id]['purgedAt'])) continue;
            $result[$id] = isset($before[$id], $result[$id])
                ? twMergeStatePatch($before[$id], $row, $result[$id]) : $row;
        }
        return array_values($result);
    }
    $result = $current;
    foreach ($base as $key => $value) {
        if (!array_key_exists($key, $changed)) unset($result[$key]);
    }
    foreach ($changed as $key => $value) {
        if (array_key_exists($key, $base) && $base[$key] === $value) continue;
        $result[$key] = array_key_exists($key, $base) && array_key_exists($key, $current)
            ? twMergeStatePatch($base[$key], $value, $current[$key]) : $value;
    }
    return $result;
}

function twSaveState(array $state): bool {
    $base = $GLOBALS['tw_loaded_state'] ?? null;
    if (!is_array($base)) return false;
    $pdo = twDb();
    try {
        $pdo->beginTransaction();
        $row = $pdo->query('SELECT state_json FROM app_state WHERE id = 1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
        $current = $row ? json_decode($row['state_json'], true) : null;
        if (!is_array($current)) { $pdo->rollBack(); return false; }
        $merged = twMergeStatePatch($base, $state, $current);
        $json = json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $stmt = $pdo->prepare('UPDATE app_state SET state_json = ?, updated_at = NOW() WHERE id = 1');
        $stmt->execute([$json]);
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        return false;
    }
}

function twClassifyReply(string $body): string {
    $t = trim($body);
    $t = preg_replace('/[\x{064B}-\x{065F}]/u', '', $t);
    $lower = mb_strtolower($t, 'UTF-8');
    $wantsChange = (bool)preg_match('/تعديل|تعديلات|رفض|مرفوض|غيروا|غيّر|change|revision|reject/u', $lower);
    $wantsApprove = (bool)preg_match('/موافق|موافقة|موافقه|اعتماد|اعتمد|أعتمد|تمام|approved|approve|\bok\b|\byes\b/u', $lower);
    if ($wantsChange) return 'rejected';
    if ($wantsApprove && mb_strlen($t) < 40) return 'approved';
    if ($wantsApprove && !$wantsChange) return 'approved';
    // Any other written reply is treated as modification notes
    return 'rejected';
}

function twExtractCode(string $body): string {
    if (preg_match('/CS-[A-Z0-9]{3,8}/i', $body, $m)) return strtoupper($m[0]);
    return '';
}

function twAppendStaffReply(string $orderId, string $approvalId, string $text, string $sentBy, string $phone = ''): array {
    $text = trim($text);
    if ($text === '') return ['ok' => false, 'error' => 'اكتب الرسالة للعميل'];
    if (mb_strlen($text, 'UTF-8') > 1200) return ['ok' => false, 'error' => 'الرسالة طويلة جداً'];
    $now = gmdate('c');
    $state = twLoadState();
    if (!$state || !isset($state['orders']) || !is_array($state['orders'])) {
        return ['ok' => false, 'error' => 'تعذر حفظ الرد حالياً'];
    }
    $reply = [
        'id' => 'sr-' . bin2hex(random_bytes(6)),
        'text' => $text,
        'sentAt' => $now,
        'sentBy' => $sentBy,
    ];
    $pageUrl = '';
    $to = twNormalizePhone($phone);
    $applied = false;
    foreach ($state['orders'] as &$order) {
        if ((string)($order['id'] ?? '') !== $orderId) continue;
        $list = isset($order['artworkApprovals']) && is_array($order['artworkApprovals'])
            ? $order['artworkApprovals'] : [];
        $found = false;
        foreach ($list as &$ap) {
            if ((string)($ap['id'] ?? '') !== $approvalId) continue;
            $replies = isset($ap['staffReplies']) && is_array($ap['staffReplies']) ? $ap['staffReplies'] : [];
            $replies[] = $reply;
            $ap['staffReplies'] = $replies;
            if ($to === '') $to = twNormalizePhone((string)($ap['customerPhone'] ?? ''));
            $pageUrl = (string)($ap['pageUrl'] ?? '');
            $found = true;
            break;
        }
        unset($ap);
        if (!$found) return ['ok' => false, 'error' => 'جولة الاعتماد غير موجودة'];
        $order['artworkApprovals'] = $list;
        $order['updatedAt'] = $now;
        $comments = isset($order['comments']) && is_array($order['comments']) ? $order['comments'] : [];
        $comments[] = [
            'id' => 'wa-s-' . bin2hex(random_bytes(6)),
            'orderId' => $orderId,
            'userId' => $sentBy !== '' ? $sentBy : 'staff',
            'text' => 'رد على العميل: ' . $text,
            'createdAt' => $now,
        ];
        $order['comments'] = $comments;
        $history = isset($order['history']) && is_array($order['history']) ? $order['history'] : [];
        $history[] = [
            'id' => 'wa-sh-' . bin2hex(random_bytes(6)),
            'orderId' => $orderId,
            'userId' => $sentBy !== '' ? $sentBy : 'staff',
            'action' => 'رد على استفسار العميل',
            'toValue' => $text,
            'timestamp' => $now,
        ];
        $order['history'] = $history;
        $applied = true;
        break;
    }
    unset($order);
    if (!$applied) return ['ok' => false, 'error' => 'الطلبية غير موجودة'];
    $wa = ['ok' => false];
    if ($to !== '') {
        $body = $text;
        if ($pageUrl !== '') $body .= "\n\n" . $pageUrl;
        $wa = twSendSession($to, $body);
        if (!empty($wa['ok']) && !empty($wa['sid'])) {
            foreach ($state['orders'] as &$order) {
                if ((string)($order['id'] ?? '') !== $orderId) continue;
                foreach ($order['artworkApprovals'] as &$ap) {
                    if ((string)($ap['id'] ?? '') !== $approvalId) continue;
                    $last = count($ap['staffReplies'] ?? []) - 1;
                    if ($last >= 0) $ap['staffReplies'][$last]['messageSid'] = $wa['sid'];
                    break;
                }
                unset($ap);
                break;
            }
            unset($order);
            $reply['messageSid'] = $wa['sid'];
        }
    }
    if (!twSaveState($state)) return ['ok' => false, 'error' => 'تعذر حفظ الرد'];
    return [
        'ok' => true,
        'reply' => $reply,
        'whatsapp' => !empty($wa['ok']),
        'error' => empty($wa['ok']) ? (string)($wa['error'] ?? '') : '',
    ];
}
