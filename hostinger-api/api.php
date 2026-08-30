<?php
// Allow requests from the React app
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [
    'https://teamwork.csapp.io',
    'https://csapp.io',
    'https://acc.csapp.io',
    'http://localhost:3000',
    'http://127.0.0.1:8765',
    'http://localhost:8765',
];
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: https://teamwork.csapp.io");
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$resourceEarly = $_GET['resource'] ?? 'app';
$isPublicFileGet = $resourceEarly === 'file' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET';

// API Key authentication (file downloads are public by unguessable id)
define('API_KEY', 'tw_Cs9kWt2026xTeAmWoRk');
$providedKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if (!$isPublicFileGet && $providedKey !== API_KEY) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

if (!$isPublicFileGet) {
    header('Content-Type: application/json; charset=utf-8');
}

// Database configuration
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

// ─── Separate lightweight store for Operations Screen ───────────────────────
// Main app_state JSON is ~20MB+ and too slow/racy for a simple table.
// Ops data lives here so sync is fast and never wiped by order saves.
$pdo->exec("CREATE TABLE IF NOT EXISTS ops_state (
    id INT PRIMARY KEY DEFAULT 1,
    state_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

$resource = $_GET['resource'] ?? 'app';

// ─── File upload / download (invoices, order forms) ─────────────────────────
if ($resource === 'file') {
    $uploadDir = __DIR__ . '/uploads';
    if (!is_dir($uploadDir)) {
        @mkdir($uploadDir, 0755, true);
    }
    $baseUrl = 'https://www.csapp.io/teamwork-api/uploads';
    $maxBytes = 20 * 1024 * 1024;

    $pdo->exec("CREATE TABLE IF NOT EXISTS file_blobs (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT 'file',
        mime VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
        ext VARCHAR(16) NOT NULL DEFAULT 'bin',
        content LONGBLOB NOT NULL,
        size INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id'] ?? '');
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id']);
            exit();
        }
        // Prefer disk
        foreach (glob($uploadDir . '/' . $id . '.*') ?: [] as $f) {
            $mime = mime_content_type($f) ?: 'application/octet-stream';
            header('Content-Type: ' . $mime);
            header('Cache-Control: public, max-age=31536000');
            header('Content-Length: ' . filesize($f));
            readfile($f);
            exit();
        }
        $stmt = $pdo->prepare('SELECT name, mime, content FROM file_blobs WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            exit();
        }
        header('Content-Type: ' . ($row['mime'] ?: 'application/octet-stream'));
        header('Cache-Control: public, max-age=31536000');
        header('Content-Disposition: inline; filename="' . addslashes($row['name']) . '"');
        echo $row['content'];
        exit();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = '';
        $name = 'file';
        $mime = 'application/octet-stream';
        $binary = null;

        if (!empty($_FILES['file']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            if (!empty($_FILES['file']['error'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Upload error code ' . $_FILES['file']['error']]);
                exit();
            }
            $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($_POST['id'] ?? ''));
            $name = (string)($_POST['name'] ?? $_FILES['file']['name'] ?? 'file');
            $mime = (string)($_POST['type'] ?? $_FILES['file']['type'] ?? 'application/octet-stream');
            $binary = file_get_contents($_FILES['file']['tmp_name']);
        } else {
            $body = file_get_contents('php://input');
            $data = json_decode($body ?: '', true);
            if (!$data || empty($data['id']) || empty($data['dataUrl'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Expected multipart file or JSON { id, name, type, dataUrl }']);
                exit();
            }
            $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$data['id']);
            $name = (string)($data['name'] ?? 'file');
            $dataUrl = (string)$data['dataUrl'];
            if (preg_match('#data:([^;]+);#', $dataUrl, $m)) $mime = $m[1];
            if (strpos($dataUrl, ',') === false) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid dataUrl']);
                exit();
            }
            $binary = base64_decode(explode(',', $dataUrl, 2)[1], true);
        }

        if (!$id || $binary === false || $binary === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id or file data']);
            exit();
        }
        if (strlen($binary) > $maxBytes) {
            http_response_code(413);
            echo json_encode(['error' => 'File too large (max 20MB)']);
            exit();
        }

        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION) ?: '');
        $ext = preg_replace('/[^a-z0-9]/', '', $ext);
        if ($ext === '') {
            if (str_contains($mime, 'png')) $ext = 'png';
            elseif (str_contains($mime, 'webp')) $ext = 'webp';
            elseif (str_contains($mime, 'gif')) $ext = 'gif';
            elseif (str_contains($mime, 'pdf')) $ext = 'pdf';
            else $ext = 'jpg';
        }

        $diskOk = false;
        $path = $uploadDir . '/' . $id . '.' . $ext;
        if (@file_put_contents($path, $binary) !== false) {
            @chmod($path, 0644);
            $diskOk = true;
        }

        // Always mirror into DB so download works even if disk write fails
        $stmt = $pdo->prepare(
            'INSERT INTO file_blobs (id, name, mime, ext, content, size)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), mime=VALUES(mime), ext=VALUES(ext),
               content=VALUES(content), size=VALUES(size), updated_at=NOW()'
        );
        $stmt->execute([$id, $name, $mime, $ext, $binary, strlen($binary)]);

        $url = $diskOk
            ? ($baseUrl . '/' . $id . '.' . $ext)
            : ('https://www.csapp.io/teamwork-api/api.php?resource=file&id=' . rawurlencode($id));

        echo json_encode(['success' => true, 'id' => $id, 'url' => $url, 'size' => strlen($binary), 'disk' => $diskOk]);
        exit();
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

if ($resource === 'ops') {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->query("SELECT state_json FROM ops_state WHERE id = 1");
        $row  = $stmt->fetch(PDO::FETCH_ASSOC);
        echo $row ? $row['state_json'] : json_encode(['rows' => [], 'updatedAt' => null]);
        exit();
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = file_get_contents('php://input');
        $decoded = json_decode($body, true);
        if (!$body || $decoded === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON']);
            exit();
        }
        // Never store heavy DataURL images in ops table
        if (isset($decoded['rows']) && is_array($decoded['rows'])) {
            foreach ($decoded['rows'] as &$r) {
                if (isset($r['jobImage']) && is_string($r['jobImage']) && strlen($r['jobImage']) > 200) {
                    $r['jobImage'] = '';
                }
            }
            unset($r);
        }
        $clean = json_encode($decoded, JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare(
            "INSERT INTO ops_state (id, state_json) VALUES (1, ?)
             ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = NOW()"
        );
        $stmt->execute([$clean]);
        echo json_encode(['success' => true, 'updatedAt' => $decoded['updatedAt'] ?? null]);
        exit();
    }
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit();
}

// ─── Main application state (orders, users, departments, …) ─────────────────
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
    $decoded = $body ? json_decode($body, true) : null;
    if (!$body || $decoded === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }
    // Guard: never let a file-upload payload wipe the whole app state
    // (happened when old PHP ignored ?resource=file and stored {id,name,dataUrl})
    $hasDepts = isset($decoded['departments']) && is_array($decoded['departments']) && count($decoded['departments']) > 0;
    $looksLikeFile = isset($decoded['dataUrl']) && !isset($decoded['departments']) && !isset($decoded['orders']);
    if (!$hasDepts || $looksLikeFile) {
        http_response_code(400);
        echo json_encode([
            'error' => 'Rejected: body is not app state (need departments[]). Use files-api.php or ?resource=file for uploads.',
        ]);
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
