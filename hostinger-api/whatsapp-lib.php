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

function twReadConfig(): array {
    $defaults = [
        'accountSid' => '',
        'authToken' => '',
        'from' => TW_DEFAULT_FROM,
    ];
    if (!is_file(TW_CONFIG_FILE)) return $defaults;
    $raw = @file_get_contents(TW_CONFIG_FILE);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) return $defaults;
    return array_merge($defaults, $data);
}

function twWriteConfig(array $cfg): bool {
    $payload = json_encode([
        'accountSid' => (string)($cfg['accountSid'] ?? ''),
        'authToken' => (string)($cfg['authToken'] ?? ''),
        'from' => (string)($cfg['from'] ?? TW_DEFAULT_FROM),
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
    if (!is_file(TW_PENDING_FILE)) return ['byPhone' => [], 'byCode' => []];
    $raw = @file_get_contents(TW_PENDING_FILE);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) return ['byPhone' => [], 'byCode' => []];
    return [
        'byPhone' => is_array($data['byPhone'] ?? null) ? $data['byPhone'] : [],
        'byCode' => is_array($data['byCode'] ?? null) ? $data['byCode'] : [],
    ];
}

function twWritePending(array $pending): void {
    @file_put_contents(TW_PENDING_FILE, json_encode($pending, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

function twRegisterPending(string $phone, string $orderId, string $approvalId, string $code): void {
    $pending = twReadPending();
    $entry = [
        'orderId' => $orderId,
        'approvalId' => $approvalId,
        'trackingCode' => $code,
        'at' => gmdate('c'),
    ];
    $pending['byPhone'][$phone] = $entry;
    $pending['byCode'][strtoupper($code)] = $entry;
    twWritePending($pending);
}

function twSendWhatsApp(string $toE164, string $body, string $mediaUrl = ''): array {
    $cfg = twReadConfig();
    $sid = trim((string)$cfg['accountSid']);
    $token = trim((string)$cfg['authToken']);
    $from = trim((string)($cfg['from'] ?: TW_DEFAULT_FROM));
    if ($sid === '' || $token === '') {
        return ['ok' => false, 'error' => 'Twilio is not configured. Add Account SID and Auth Token in Settings.'];
    }
    if (!str_starts_with($from, 'whatsapp:')) $from = 'whatsapp:' . $from;
    $to = $toE164;
    if (!str_starts_with($to, 'whatsapp:')) $to = 'whatsapp:' . $to;

    $post = [
        'From' => $from,
        'To' => $to,
        'Body' => $body,
    ];
    if ($mediaUrl !== '') $post['MediaUrl'] = $mediaUrl;

    $ch = curl_init('https://api.twilio.com/2010-04-01/Accounts/' . rawurlencode($sid) . '/Messages.json');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($post),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD => $sid . ':' . $token,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) return ['ok' => false, 'error' => $err ?: 'curl failed'];
    $data = json_decode($raw, true);
    if ($http >= 200 && $http < 300 && !empty($data['sid'])) {
        return ['ok' => true, 'sid' => $data['sid']];
    }
    $msg = $data['message'] ?? ($data['error_message'] ?? ('HTTP ' . $http));
    $code = $data['code'] ?? '';
    return ['ok' => false, 'error' => trim($code . ' ' . $msg), 'twilio' => $data];
}

function twLoadState(): ?array {
    $stmt = twDb()->query('SELECT state_json FROM app_state WHERE id = 1');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || empty($row['state_json'])) return null;
    $data = json_decode($row['state_json'], true);
    return is_array($data) ? $data : null;
}

function twSaveState(array $state): bool {
    $json = json_encode($state, JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;
    $stmt = twDb()->prepare(
        'INSERT INTO app_state (id, state_json) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = NOW()'
    );
    return $stmt->execute([$json]);
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
