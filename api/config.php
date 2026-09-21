<?php
// Fuso oficial do servidor e da aplicação: Brasil/Recife (UTC-03:00).
date_default_timezone_set('America/Recife');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = $_GET['action'] ?? '';
$supabaseUrl = rtrim((string) (getenv('SUPABASE_URL') ?: 'https://fwldefyksaltfvdhwdfi.supabase.co'), '/');
$supabasePublishableKey = (string) (getenv('SUPABASE_PUBLISHABLE_KEY') ?: getenv('SUPABASE_ANON_KEY') ?: 'sb_publishable_sJp0S2rwqiaIqF6XnjWO7A_saKSK3m5');
$supabaseServiceKey = (string) (getenv('SUPABASE_SERVICE_ROLE_KEY') ?: getenv('SUPABASE_SECRET_KEY') ?: '');
$noDbActions = [
    'checkAppJs', 'saveSettings', 'listSettings', 'saveBackup', 'listBackup',
    'login', 'register', 'session', 'logout', 'listUsers', 'approveUser',
    'rejectUser', 'updateUserRole', 'deleteUser'
];

if (!in_array($action, $noDbActions)) {
    // Em produção, o SQLite acompanha o projeto no servidor. O caminho pode
    // ser sobrescrito com DB_SQLITE_PATH. O pendrive fica apenas como
    // fallback para o ambiente local deste computador.
    $databaseCandidates = array_values(array_filter([
        getenv('DB_SQLITE_PATH') ?: null,
        __DIR__ . '/../data/dominoduelpro.sqlite',
        '/Volumes/Pendrive002/db_domino/dominoduelpro.sqlite'
    ]));
    $sqlitePath = null;
    foreach ($databaseCandidates as $candidate) {
        if (is_file($candidate) && is_readable($candidate)) {
            $sqlitePath = $candidate;
            break;
        }
    }

    if ($sqlitePath === null) {
        http_response_code(500);
        echo json_encode([
            'error' => 'SQLite database not found or not readable.',
            'paths_checked' => $databaseCandidates
        ]);
        exit;
    }

    if (!is_writable($sqlitePath) || !is_writable(dirname($sqlitePath))) {
        http_response_code(500);
        echo json_encode([
            'error' => 'SQLite database is not writable by the server.',
            'path' => $sqlitePath
        ]);
        exit;
    }

    try {
        $pdo = new PDO('sqlite:' . $sqlitePath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA busy_timeout = 5000');
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'SQLite database connection failed: ' . $e->getMessage()]);
        exit;
    }
}

function jsonInput() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function supabaseRequest($method, $endpoint, $body = null, $bearerToken = null, $apiKey = null, $extraHeaders = []) {
    global $supabaseUrl, $supabasePublishableKey, $supabaseServiceKey;
    $key = $apiKey ?: $supabaseServiceKey;
    if ($key === '') {
        return ['status' => 0, 'body' => ['error' => 'Supabase server key is not configured.']];
    }

    $headers = [
        'apikey: ' . $key,
        'Authorization: Bearer ' . ($bearerToken ?: $key),
        'Accept: application/json'
    ];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    foreach ($extraHeaders as $header) {
        $headers[] = $header;
    }

    $curl = curl_init($supabaseUrl . $endpoint);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20
    ]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($curl);
    $curlError = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($raw === false) {
        return ['status' => 0, 'body' => ['error' => $curlError ?: 'Supabase request failed.']];
    }
    $decoded = json_decode($raw, true);
    return ['status' => $status, 'body' => $decoded !== null ? $decoded : []];
}

function supabaseCurrentProfile() {
    global $supabasePublishableKey, $supabaseServiceKey;
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
        return null;
    }
    $token = $matches[1];
    $auth = supabaseRequest('GET', '/auth/v1/user', null, $token, $supabasePublishableKey);
    if ($auth['status'] < 200 || $auth['status'] >= 300 || empty($auth['body']['id'])) {
        return null;
    }
    $id = rawurlencode($auth['body']['id']);
    $profiles = supabaseRequest(
        'GET',
        '/rest/v1/profiles?select=id,email,role,status,created_at&id=eq.' . $id . '&limit=1',
        null,
        null,
        $supabaseServiceKey
    );
    return ($profiles['status'] >= 200 && $profiles['status'] < 300 && !empty($profiles['body'][0]))
        ? $profiles['body'][0]
        : null;
}

function supabaseProfileById($id) {
    global $supabaseServiceKey;
    $response = supabaseRequest(
        'GET',
        '/rest/v1/profiles?select=id,email,role,status,created_at&id=eq.' . rawurlencode($id) . '&limit=1',
        null,
        null,
        $supabaseServiceKey
    );
    return ($response['status'] >= 200 && $response['status'] < 300 && !empty($response['body'][0]))
        ? $response['body'][0]
        : null;
}

function requireSupabaseAdmin() {
    $profile = supabaseCurrentProfile();
    if (!$profile || $profile['role'] !== 'admin' || $profile['status'] !== 'approved') {
        http_response_code(403);
        echo json_encode(['error' => 'Acesso de administrador necessário.']);
        return null;
    }
    return $profile;
}
