<?php
/**
 * Operations Screen sync — FILE based (no MySQL).
 * Upload to Hostinger as:
 *   public_html/teamwork-api/ops-sync.php
 *
 * Creates ops_data.json in the same folder.
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'tw_Cs9kWt2026xTeAmWoRk') {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

$file = __DIR__ . '/ops_data.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!is_file($file)) {
        echo json_encode(['rows' => [], 'updatedAt' => null]);
        exit();
    }
    readfile($file);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    $data = json_decode($body, true);
    if (!$data || !isset($data['rows']) || !is_array($data['rows'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }
    foreach ($data['rows'] as &$r) {
        if (isset($r['jobImage']) && is_string($r['jobImage']) && strlen($r['jobImage']) > 200) {
            $r['jobImage'] = '';
        }
    }
    unset($r);
    if (empty($data['updatedAt'])) $data['updatedAt'] = gmdate('c');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE);
    if (@file_put_contents($file, $json, LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot write ops_data.json — set folder permissions to 755']);
        exit();
    }
    echo json_encode(['success' => true, 'updatedAt' => $data['updatedAt'], 'count' => count($data['rows'])]);
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
