<?php
/**
 * Dedicated Operations Screen API — file-based (no MySQL).
 * Upload to: public_html/teamwork-api/ops-api.php
 *
 * Uses a local JSON file so sync is fast and never blocked by the huge app_state DB.
 */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

define('API_KEY', 'tw_Cs9kWt2026xTeAmWoRk');
$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($providedKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

$dataFile = __DIR__ . '/ops_data.json';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!file_exists($dataFile)) {
        echo json_encode(['rows' => [], 'updatedAt' => null]);
        exit();
    }
    $raw = @file_get_contents($dataFile);
    if ($raw === false || $raw === '') {
        echo json_encode(['rows' => [], 'updatedAt' => null]);
        exit();
    }
    // Validate JSON
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !isset($decoded['rows'])) {
        echo json_encode(['rows' => [], 'updatedAt' => null]);
        exit();
    }
    echo $raw;
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    $decoded = json_decode($body, true);
    if (!$body || $decoded === null || !isset($decoded['rows']) || !is_array($decoded['rows'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON — expected { rows: [], updatedAt: string }']);
        exit();
    }
    // Strip heavy DataURL images
    foreach ($decoded['rows'] as &$r) {
        if (!is_array($r)) continue;
        if (isset($r['jobImage']) && is_string($r['jobImage']) && strlen($r['jobImage']) > 200) {
            $r['jobImage'] = '';
        }
    }
    unset($r);
    if (empty($decoded['updatedAt'])) {
        $decoded['updatedAt'] = gmdate('c');
    }
    $clean = json_encode($decoded, JSON_UNESCAPED_UNICODE);
    $ok = @file_put_contents($dataFile, $clean, LOCK_EX);
    if ($ok === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to write ops_data.json — check folder permissions']);
        exit();
    }
    echo json_encode([
        'success' => true,
        'updatedAt' => $decoded['updatedAt'],
        'count' => count($decoded['rows']),
    ]);
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
