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

// Credentials stay server-side in this ignored file. Environment variables
// remain a fallback for hosts that provide secret configuration natively.
function loadJsonConfig($path) {
    if (!is_readable($path)) return [];
    $config = json_decode(file_get_contents($path), true);
    return is_array($config) ? $config : [];
}

function configValue($localConfig, $keys, $fallback = '') {
    foreach ($keys as $key) {
        $environmentValue = getenv($key);
        if ($environmentValue !== false && $environmentValue !== '') return $environmentValue;
        if (isset($localConfig[$key]) && $localConfig[$key] !== '') return $localConfig[$key];
    }
    return $fallback;
}

$localConfig = loadJsonConfig(__DIR__ . '/config.local.json');
$supabaseUrl = rtrim((string) configValue($localConfig, ['SUPABASE_URL'], 'https://fwldefyksaltfvdhwdfi.supabase.co'), '/');
$supabasePublishableKey = (string) configValue($localConfig, ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'], 'sb_publishable_sJp0S2rwqiaIqF6XnjWO7A_saKSK3m5');
$supabaseServiceKey = (string) configValue($localConfig, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);

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
    global $supabasePublishableKey;
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
        '/rest/v1/profiles?select=id,email,role,status,password_change_required,created_at&id=eq.' . $id . '&limit=1',
        null,
        $token,
        $supabasePublishableKey
    );
    return ($profiles['status'] >= 200 && $profiles['status'] < 300 && !empty($profiles['body'][0]))
        ? $profiles['body'][0]
        : null;
}

function supabaseProfileById($id, $bearerToken = null) {
    global $supabasePublishableKey, $supabaseServiceKey;
    $apiKey = $bearerToken ? $supabasePublishableKey : $supabaseServiceKey;
    $response = supabaseRequest(
        'GET',
        '/rest/v1/profiles?select=id,email,role,status,password_change_required,created_at&id=eq.' . rawurlencode($id) . '&limit=1',
        null,
        $bearerToken,
        $apiKey
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

function requireSupabaseApprovedUser() {
    $profile = supabaseCurrentProfile();
    if (!$profile || $profile['status'] !== 'approved') {
        http_response_code(403);
        echo json_encode(['error' => 'Acesso autenticado necessário.']);
        return null;
    }
    return $profile;
}
