<?php
// Allow requests from the React app
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://teamwork.cskwt.com', 'http://localhost:3000'];
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: https://teamwork.cskwt.com");
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// API Key authentication
define('API_KEY', 'tw_Cs9kWt2026xTeAmWoRk');
$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($providedKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

// Database configuration
$host    = 'localhost';
$db      = 'u805159754_teamwork';
$user    = 'u805159754_teamwork';
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

// Create table if it doesn't exist
$pdo->exec("CREATE TABLE IF NOT EXISTS app_state (
    id INT PRIMARY KEY DEFAULT 1,
    state_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query("SELECT state_json FROM app_state WHERE id = 1");
    $row  = $stmt->fetch(PDO::FETCH_ASSOC);
    echo $row ? $row['state_json'] : 'null';

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    if (!$body || json_decode($body) === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }
    $stmt = $pdo->prepare(
        "INSERT INTO app_state (id, state_json) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = NOW()"
    );
    $stmt->execute([$body]);
    echo json_encode(['success' => true]);

} else {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
}
