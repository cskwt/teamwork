<?php
/**
 * Twilio WhatsApp send + config for artwork approval.
 * Upload to: public_html/teamwork-api/whatsapp-api.php
 */
require_once __DIR__ . '/whatsapp-lib.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
    'https://teamwork.csapp.io',
    'https://csapp.io',
    'https://acc.csapp.io',
    'http://localhost:3000',
    'http://127.0.0.1:8765',
    'http://localhost:8765',
];
header('Access-Control-Allow-Origin: ' . (in_array($origin, $allowed, true) ? $origin : 'https://teamwork.csapp.io'));
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit();
}

if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== TW_API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = $_GET['action'] ?? '';

if ($method === 'GET' && ($action === 'config' || $action === '')) {
    $cfg = twReadConfig();
    echo json_encode([
        'configured' => trim((string)$cfg['accountSid']) !== '' && trim((string)$cfg['authToken']) !== '',
        'from' => $cfg['from'] ?: TW_DEFAULT_FROM,
        'accountSidMasked' => twMaskSid((string)$cfg['accountSid']),
        'webhookUrl' => 'https://www.csapp.io/teamwork-api/whatsapp-webhook.php',
    ]);
    exit();
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit();
}
$action = (string)($body['action'] ?? $action);

if ($action === 'save-config') {
    $sid = trim((string)($body['accountSid'] ?? ''));
    $token = trim((string)($body['authToken'] ?? ''));
    $from = trim((string)($body['from'] ?? TW_DEFAULT_FROM)) ?: TW_DEFAULT_FROM;
    $prev = twReadConfig();
    if ($sid === '') $sid = (string)$prev['accountSid'];
    if ($token === '') $token = (string)$prev['authToken'];
    if ($sid === '' || $token === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Account SID and Auth Token are required']);
        exit();
    }
    if (!str_starts_with($from, 'whatsapp:')) {
        $n = twNormalizePhone($from);
        $from = 'whatsapp:' . ($n !== '' ? $n : ('+' . preg_replace('/\D/', '', $from)));
    }
    $ok = twWriteConfig(['accountSid' => $sid, 'authToken' => $token, 'from' => $from]);
    echo json_encode(['success' => $ok, 'from' => $from, 'accountSidMasked' => twMaskSid($sid)]);
    exit();
}

if ($action === 'send') {
    $to = twNormalizePhone((string)($body['to'] ?? ''));
    $text = trim((string)($body['body'] ?? ''));
    $media = trim((string)($body['mediaUrl'] ?? ''));
    $orderId = trim((string)($body['orderId'] ?? ''));
    $approvalId = trim((string)($body['approvalId'] ?? ''));
    $code = strtoupper(trim((string)($body['trackingCode'] ?? '')));
    if ($to === '' || $text === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Missing phone or message']);
        exit();
    }
    if ($media !== '' && !str_starts_with($media, 'http')) {
        http_response_code(400);
        echo json_encode(['error' => 'Image must be a public URL']);
        exit();
    }
    $sent = twSendWhatsApp($to, $text, $media);
    if (!$sent['ok']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $sent['error'] ?? 'send failed']);
        exit();
    }
    if ($orderId && $approvalId && $code) {
        twRegisterPending($to, $orderId, $approvalId, $code);
    }
    echo json_encode(['success' => true, 'sid' => $sent['sid'] ?? null, 'to' => $to]);
    exit();
}

http_response_code(400);
echo json_encode(['error' => 'Unknown action']);
