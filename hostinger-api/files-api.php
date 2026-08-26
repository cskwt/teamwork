<?php
/**
 * Shared file storage for invoices / order forms.
 * Upload to: public_html/teamwork-api/files-api.php
 *
 * POST multipart: id, name, type, file  (preferred — works for large images)
 * POST JSON: { id, name, type, dataUrl } (legacy)
 * → saves under uploads/ and returns { success, url }
 *
 * Files are public via: https://www.csapp.io/teamwork-api/uploads/...
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: no-store');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit();
}

$uploadDir = __DIR__ . '/uploads';
if (!is_dir($uploadDir)) {
    if (!@mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Cannot create uploads directory']);
        exit();
    }
}

$baseUrl = 'https://www.csapp.io/teamwork-api/uploads';
$maxBytes = 20 * 1024 * 1024; // 20 MB

// Force-download proxy (CORS + Content-Disposition: attachment)
if ($method === 'GET' && (($_GET['action'] ?? '') === 'download')) {
    if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'tw_Cs9kWt2026xTeAmWoRk') {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Unauthorized']);
        exit();
    }
    $file = basename((string)($_GET['file'] ?? ''));
    $file = preg_replace('/[^a-zA-Z0-9._-]/', '', $file);
    if ($file === '' || str_contains($file, '..')) {
        http_response_code(400);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Invalid file']);
        exit();
    }
    $path = $uploadDir . '/' . $file;
    if (!is_file($path)) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'File not found']);
        exit();
    }
    $downloadName = (string)($_GET['name'] ?? $file);
    $downloadName = preg_replace('/[\r\n"\\\\]/', '_', $downloadName) ?: $file;
    $mime = 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $downloadName . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit();
}

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'tw_Cs9kWt2026xTeAmWoRk') {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit();
}

$mimeExt = [
    'application/pdf' => 'pdf',
    'image/jpeg' => 'jpg',
    'image/jpg' => 'jpg',
    'image/pjpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/svg+xml' => 'svg',
    'application/postscript' => 'ai',
    'application/illustrator' => 'ai',
    'image/vnd.adobe.photoshop' => 'psd',
    'application/x-cdr' => 'cdr',
    'application/cdr' => 'cdr',
];

function resolve_ext(string $name, string $mime, array $mimeExt): string {
    $ext = pathinfo($name, PATHINFO_EXTENSION);
    if ($ext && strlen($ext) <= 8) {
        $clean = strtolower(preg_replace('/[^a-z0-9]/', '', $ext));
        if ($clean !== '') return $clean;
    }
    if (isset($mimeExt[$mime])) return $mimeExt[$mime];
    // WhatsApp / phone cameras often omit useful extension MIME
    if (str_contains($mime, 'jpeg') || str_contains($mime, 'jpg')) return 'jpg';
    if (str_contains($mime, 'png')) return 'png';
    if (str_contains($mime, 'webp')) return 'webp';
    if (str_contains($mime, 'pdf')) return 'pdf';
    return 'bin';
}

function save_upload(string $uploadDir, string $baseUrl, string $id, string $ext, string $binary, int $maxBytes): void {
    if (strlen($binary) > $maxBytes) {
        http_response_code(413);
        echo json_encode(['error' => 'File too large (max 20MB)']);
        exit();
    }
    $safeName = $id . '.' . $ext;
    $path = $uploadDir . '/' . $safeName;
    if (@file_put_contents($path, $binary) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot write file — check uploads/ permissions (755)']);
        exit();
    }
    @chmod($path, 0644);
    echo json_encode([
        'success' => true,
        'id' => $id,
        'url' => $baseUrl . '/' . $safeName,
        'size' => strlen($binary),
    ]);
    exit();
}

if ($method === 'POST') {
    // Preferred: multipart binary upload (images)
    if (!empty($_FILES['file'])) {
        $fileErr = (int)($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($fileErr !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'Upload error code ' . $fileErr]);
            exit();
        }
        if (!is_uploaded_file($_FILES['file']['tmp_name'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid upload']);
            exit();
        }
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($_POST['id'] ?? ''));
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id']);
            exit();
        }
        $name = (string)($_POST['name'] ?? $_FILES['file']['name'] ?? 'file');
        $mime = (string)($_POST['type'] ?? $_FILES['file']['type'] ?? '');
        $ext = resolve_ext($name, $mime, $mimeExt);
        $binary = file_get_contents($_FILES['file']['tmp_name']);
        if ($binary === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Cannot read uploaded file']);
            exit();
        }
        save_upload($uploadDir, $baseUrl, $id, $ext, $binary, $maxBytes);
    }

    // Legacy JSON dataUrl
    $body = file_get_contents('php://input');
    $data = json_decode($body ?: '', true);
    if (!$data || empty($data['id']) || empty($data['dataUrl'])) {
        http_response_code(400);
        echo json_encode([
            'error' => 'Expected multipart file or JSON { id, name, type, dataUrl }',
            'method' => $method,
            'hasFiles' => !empty($_FILES),
        ]);
        exit();
    }

    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$data['id']);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid id']);
        exit();
    }
    $name = isset($data['name']) ? (string)$data['name'] : 'file';
    $mime = '';
    if (preg_match('#data:([^;]+);#', $data['dataUrl'], $m)) {
        $mime = $m[1];
    }
    $ext = resolve_ext($name, $mime, $mimeExt);

    $dataUrl = $data['dataUrl'];
    if (strpos($dataUrl, ',') === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid dataUrl']);
        exit();
    }
    $parts = explode(',', $dataUrl, 2);
    $binary = base64_decode($parts[1], true);
    if ($binary === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid base64']);
        exit();
    }
    save_upload($uploadDir, $baseUrl, $id, $ext, $binary, $maxBytes);
}

if ($method === 'DELETE') {
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id'] ?? '');
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit();
    }
    $deleted = 0;
    foreach (glob($uploadDir . '/' . $id . '.*') ?: [] as $f) {
        if (@unlink($f)) $deleted++;
    }
    echo json_encode(['success' => true, 'deleted' => $deleted]);
    exit();
}

if ($method === 'GET') {
    echo json_encode(['ok' => true, 'service' => 'files-api', 'maxBytes' => $maxBytes]);
    exit();
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed', 'method' => $method]);
