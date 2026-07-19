<?php
/**
 * Dedicated Operations Screen API — lightweight JSON store.
 * Upload this file next to api.php on Hostinger:
 *   public_html/teamwork-api/ops-api.php
 *
 * MUST be a separate file so ops sync never touches the 20MB+ app_state blob.
 */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://teamwork.csapp.io', 'https://csapp.io', 'http://localhost:3000'];
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: https://teamwork.csapp.io");
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

define('API_KEY', 'tw_Cs9kWt2026xTeAmWoRk');
$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($providedKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

$host    = 'localhost';
$db      = 'u805159754_tw';
$user    = 'u805159754_tw';
$pass    = 'Teamwork@2026';
$charset = 'utf8mb4';

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$db;charset=$charset",
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed', 'detail' => $e->getMessage()]);
    exit();
}

$pdo->exec("CREATE TABLE IF NOT EXISTS ops_state (
    id INT PRIMARY KEY DEFAULT 1,
    state_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query("SELECT state_json FROM ops_state WHERE id = 1");
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);
    echo $row ? $row['state_json'] : json_encode(['rows' => [], 'updatedAt' => null]);
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
    // Strip heavy DataURL images — keep text fields only
    foreach ($decoded['rows'] as &$r) {
        if (isset($r['jobImage']) && is_string($r['jobImage']) && strlen($r['jobImage']) > 200) {
            $r['jobImage'] = '';
        }
    }
    unset($r);
    if (empty($decoded['updatedAt'])) {
        $decoded['updatedAt'] = gmdate('c');
    }
    $clean = json_encode($decoded, JSON_UNESCAPED_UNICODE);
    $stmt = $pdo->prepare(
        "INSERT INTO ops_state (id, state_json) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = NOW()"
    );
    $stmt->execute([$clean]);
    echo json_encode(['success' => true, 'updatedAt' => $decoded['updatedAt'], 'count' => count($decoded['rows'])]);
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
