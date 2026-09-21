<?php
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

try {
switch ($action) {

    /* ---------- PLAYERS ---------- */
    case 'listPlayers':
        $response = supabaseRequest(
            'GET',
            '/rest/v1/players?select=id,name,photo&order=name.asc',
            null,
            null,
            $supabaseServiceKey
        );
        echo json_encode($response['body']);
        break;

    case 'savePlayers':
        if (!requireSupabaseApprovedUser()) break;
        $input = jsonInput();
        $players = $input['players'] ?? [];
        $existing = supabaseRequest('GET', '/rest/v1/players?select=id', null, null, $supabaseServiceKey);
        $incomingIds = array_values(array_filter(array_map(fn($p) => $p['id'] ?? null, $players)));
        foreach (($existing['body'] ?? []) as $row) {
            if (!in_array($row['id'], $incomingIds, true)) {
                supabaseRequest(
                    'DELETE',
                    '/rest/v1/players?id=eq.' . rawurlencode($row['id']),
                    null,
                    null,
                    $supabaseServiceKey
                );
            }
        }
        $rows = array_map(fn($p) => [
            'id' => $p['id'],
            'name' => $p['name'],
            'photo' => $p['photo'] ?? null
        ], $players);
        $response = supabaseRequest(
            'POST',
            '/rest/v1/players?on_conflict=id',
            $rows,
            null,
            $supabaseServiceKey,
            ['Prefer: resolution=merge-duplicates,return=minimal']
        );
        echo json_encode(['success' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    /* ---------- MATCHES ---------- */
    case 'listMatches':
        $response = supabaseRequest(
            'GET',
            '/rest/v1/matches?select=id,date,team_a,team_b,score_a,score_b,winner,buchuda,buchuda_de_re,duration_sec&order=date.desc,id.desc',
            null,
            null,
            $supabaseServiceKey
        );
        echo json_encode($response['body']);
        break;

    case 'saveMatches':
        if (!requireSupabaseApprovedUser()) break;
        $input = jsonInput();
        $matches = $input['matches'] ?? [];
        $existing = supabaseRequest('GET', '/rest/v1/matches?select=id', null, null, $supabaseServiceKey);
        $incomingIds = array_values(array_filter(array_map(fn($m) => $m['id'] ?? null, $matches)));
        foreach (($existing['body'] ?? []) as $row) {
            if (!in_array($row['id'], $incomingIds, true)) {
                supabaseRequest(
                    'DELETE',
                    '/rest/v1/matches?id=eq.' . rawurlencode($row['id']),
                    null,
                    null,
                    $supabaseServiceKey
                );
            }
        }
        $rows = array_map(fn($m) => [
            'id' => $m['id'],
            'date' => $m['date'] ?? null,
            'team_a' => $m['teamA'] ?? $m['team_a'] ?? [],
            'team_b' => $m['teamB'] ?? $m['team_b'] ?? [],
            'score_a' => $m['scoreA'] ?? $m['score_a'] ?? 0,
            'score_b' => $m['scoreB'] ?? $m['score_b'] ?? 0,
            'winner' => $m['winner'],
            'buchuda' => !empty($m['buchuda']),
            'buchuda_de_re' => !empty($m['buchudaDeRe']) || !empty($m['buchuda_de_re']),
            'duration_sec' => $m['durationSec'] ?? $m['duration_sec'] ?? 0
        ], $matches);
        $response = supabaseRequest(
            'POST',
            '/rest/v1/matches?on_conflict=id',
            $rows,
            null,
            $supabaseServiceKey,
            ['Prefer: resolution=merge-duplicates,return=minimal']
        );
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    case 'deleteMatch':
        $input = jsonInput();
        if (!requireSupabaseAdmin()) break;
        $id = $input['id'] ?? '';
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id']);
            break;
        }
        $response = supabaseRequest(
            'DELETE',
            '/rest/v1/matches?id=eq.' . rawurlencode($id),
            null,
            null,
            $supabaseServiceKey
        );
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    /* ---------- USERS ---------- */
    case 'register':
        $input = jsonInput();
        $auth = supabaseRequest(
            'POST',
            '/auth/v1/signup',
            ['email' => $input['email'] ?? '', 'password' => $input['password'] ?? ''],
            null,
            $supabasePublishableKey
        );
        if ($auth['status'] < 200 || $auth['status'] >= 300 || empty($auth['body']['user']['id'])) {
            http_response_code($auth['status'] === 422 ? 409 : 400);
            echo json_encode(['error' => $auth['body']['msg'] ?? $auth['body']['message'] ?? 'Não foi possível criar a conta.']);
            break;
        }
        $profile = [
            'id' => $auth['body']['user']['id'],
            'email' => $input['email'],
            'role' => 'user',
            'status' => 'pending',
            'password_change_required' => true
        ];
        $profileWrite = supabaseRequest(
            'POST',
            '/rest/v1/profiles?on_conflict=id',
            $profile,
            null,
            $supabaseServiceKey,
            ['Prefer: resolution=merge-duplicates,return=minimal']
        );
        if ($profileWrite['status'] < 200 || $profileWrite['status'] >= 300) {
            http_response_code(500);
            echo json_encode(['error' => 'Conta criada, mas não foi possível criar o perfil de acesso.']);
            break;
        }
        echo json_encode(['ok' => true, 'email' => $input['email'], 'role' => 'user', 'status' => 'pending']);
        break;

    case 'login':
        $input = jsonInput();
        $auth = supabaseRequest(
            'POST',
            '/auth/v1/token?grant_type=password',
            ['email' => $input['email'] ?? '', 'password' => $input['password'] ?? ''],
            null,
            $supabasePublishableKey
        );
        if ($auth['status'] < 200 || $auth['status'] >= 300 || empty($auth['body']['user']['id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'E-mail ou senha incorretos.']);
            break;
        }
        $user = supabaseProfileById(
            $auth['body']['user']['id'],
            $auth['body']['access_token'] ?? null
        );
        if (!$user) {
            http_response_code(403);
            echo json_encode(['error' => 'Perfil de acesso não configurado.']);
            break;
        }
        if ($user['status'] === 'pending') {
            http_response_code(403);
            echo json_encode(['error' => 'Aguardando aprova\u00e7\u00e3o do admin.']);
            break;
        }
        if ($user['status'] === 'rejected') {
            http_response_code(403);
            echo json_encode(['error' => 'Seu cadastro foi rejeitado.']);
            break;
        }
        echo json_encode([
            'ok' => true,
            'email' => $user['email'],
            'role' => $user['role'],
            'password_change_required' => !empty($user['password_change_required']),
            'access_token' => $auth['body']['access_token'] ?? null,
            'refresh_token' => $auth['body']['refresh_token'] ?? null,
            'expires_in' => $auth['body']['expires_in'] ?? null
        ]);
        break;

    case 'completeFirstAccessPasswordChange':
        $profile = requireSupabaseApprovedUser();
        if (!$profile) break;
        $input = jsonInput();
        $password = (string) ($input['password'] ?? '');
        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'A nova senha deve ter pelo menos 6 caracteres.']);
            break;
        }
        $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
            http_response_code(401);
            echo json_encode(['error' => 'Sessão inválida.']);
            break;
        }
        $authUpdate = supabaseRequest(
            'PUT',
            '/auth/v1/user',
            ['password' => $password],
            $matches[1],
            $supabasePublishableKey
        );
        if ($authUpdate['status'] < 200 || $authUpdate['status'] >= 300) {
            http_response_code(400);
            echo json_encode(['error' => $authUpdate['body']['message'] ?? 'Não foi possível alterar a senha.']);
            break;
        }
        $profileUpdate = supabaseRequest(
            'PATCH',
            '/rest/v1/profiles?id=eq.' . rawurlencode($profile['id']),
            ['password_change_required' => false, 'password_reset_offered' => true],
            null,
            $supabaseServiceKey,
            ['Prefer: return=minimal']
        );
        if ($profileUpdate['status'] < 200 || $profileUpdate['status'] >= 300) {
            http_response_code(500);
            echo json_encode(['error' => 'Senha alterada, mas não foi possível concluir o primeiro acesso.']);
            break;
        }
        echo json_encode(['ok' => true]);
        break;

    case 'completePasswordRecovery':
        $profile = supabaseCurrentProfile();
        if (!$profile) {
            http_response_code(401);
            echo json_encode(['error' => 'Sessão de recuperação inválida.']);
            break;
        }
        if ($supabaseServiceKey === '') {
            http_response_code(500);
            echo json_encode(['error' => 'SUPABASE_SECRET_KEY não configurada no servidor.']);
            break;
        }
        $profileUpdate = supabaseRequest(
            'PATCH',
            '/rest/v1/profiles?id=eq.' . rawurlencode($profile['id']),
            ['password_change_required' => false, 'password_reset_offered' => true],
            null,
            $supabaseServiceKey,
            ['Prefer: return=minimal']
        );
        echo json_encode(['ok' => $profileUpdate['status'] >= 200 && $profileUpdate['status'] < 300]);
        break;

    case 'session':
        $profile = supabaseCurrentProfile();
        if (!$profile || $profile['status'] !== 'approved') {
            http_response_code(401);
            echo json_encode(['error' => 'Sessão inválida.']);
            break;
        }
        echo json_encode([
            'ok' => true,
            'email' => $profile['email'],
            'role' => $profile['role'],
            'password_change_required' => !empty($profile['password_change_required'])
        ]);
        break;

    case 'logout':
        echo json_encode(['ok' => true]);
        break;

    case 'listUsers':
        if (!requireSupabaseAdmin()) break;
        $users = supabaseRequest(
            'GET',
            '/rest/v1/profiles?select=id,email,role,status,created_at&order=created_at.asc',
            null,
            null,
            $supabaseServiceKey
        );
        echo json_encode($users['body']);
        break;

    case 'approveUser':
        $input = jsonInput();
        if (!requireSupabaseAdmin()) break;
        $response = supabaseRequest(
            'PATCH',
            '/rest/v1/profiles?id=eq.' . rawurlencode($input['id'] ?? ''),
            ['status' => 'approved'],
            null,
            $supabaseServiceKey,
            ['Prefer: return=minimal']
        );
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    case 'rejectUser':
        $input = jsonInput();
        if (!requireSupabaseAdmin()) break;
        $response = supabaseRequest(
            'PATCH',
            '/rest/v1/profiles?id=eq.' . rawurlencode($input['id'] ?? ''),
            ['status' => 'rejected'],
            null,
            $supabaseServiceKey,
            ['Prefer: return=minimal']
        );
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    case 'updateUserRole':
        $input = jsonInput();
        $allowed = ['admin', 'user'];
        if (!in_array($input['role'], $allowed)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid role']);
            break;
        }
        if (!requireSupabaseAdmin()) break;
        $response = supabaseRequest(
            'PATCH',
            '/rest/v1/profiles?id=eq.' . rawurlencode($input['id'] ?? ''),
            ['role' => $input['role']],
            null,
            $supabaseServiceKey,
            ['Prefer: return=minimal']
        );
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    case 'forceUserPasswordChange':
        if (!requireSupabaseAdmin()) break;
        $input = jsonInput();
        $id = (string) ($input['id'] ?? '');
        if (!preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            http_response_code(400);
            echo json_encode(['error' => 'Usuário inválido.']);
            break;
        }
        $response = supabaseRequest(
            'PATCH',
            '/rest/v1/profiles?id=eq.' . rawurlencode($id),
            ['password_change_required' => true, 'password_reset_offered' => false],
            null,
            $supabaseServiceKey,
            ['Prefer: return=minimal']
        );
        if ($response['status'] < 200 || $response['status'] >= 300) {
            http_response_code($response['status'] === 0 ? 500 : 400);
            echo json_encode(['error' => 'Não foi possível exigir a troca de senha.']);
            break;
        }
        echo json_encode(['ok' => true]);
        break;

    // Bootstrap/recuperação do admin raiz: cria ou redefine a senha no
    // Supabase Auth e garante o perfil admin aprovado. Exige o segredo
    // ROOT_SETUP_SECRET e força a troca de senha no primeiro acesso.
    case 'setupRootAdmin':
        $input = jsonInput();
        $secret = (string) ($input['secret'] ?? $_GET['secret'] ?? '');
        $email = strtolower(trim((string) ($input['email'] ?? $_GET['email'] ?? '')));
        $password = (string) ($input['password'] ?? $_GET['password'] ?? '');
        if ($rootSetupSecret === '') {
            http_response_code(403);
            echo json_encode(['error' => 'ROOT_SETUP_SECRET nao configurado no servidor.']);
            break;
        }
        if (!hash_equals($rootSetupSecret, $secret)) {
            http_response_code(403);
            echo json_encode(['error' => 'Segredo invalido.']);
            break;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'E-mail invalido.']);
            break;
        }
        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'A senha temporaria deve ter pelo menos 6 caracteres.']);
            break;
        }
        $lookup = supabaseRequest(
            'GET',
            '/auth/v1/admin/users?email=' . rawurlencode($email),
            null,
            null,
            $supabaseServiceKey
        );
        $existing = $lookup['body']['users'][0] ?? null;
        $authWrite = $existing
            ? supabaseRequest(
                'PUT',
                '/auth/v1/admin/users/' . rawurlencode($existing['id']),
                ['password' => $password, 'email_confirm' => true],
                null,
                $supabaseServiceKey
            )
            : supabaseRequest(
                'POST',
                '/auth/v1/admin/users',
                ['email' => $email, 'password' => $password, 'email_confirm' => true],
                null,
                $supabaseServiceKey
            );
        $userId = $authWrite['body']['id'] ?? ($existing['id'] ?? null);
        if ($authWrite['status'] < 200 || $authWrite['status'] >= 300 || !$userId) {
            http_response_code($authWrite['status'] === 0 ? 500 : 400);
            echo json_encode(['error' => $authWrite['body']['msg'] ?? $authWrite['body']['message'] ?? 'Nao foi possivel criar o acesso.']);
            break;
        }
        $profile = [
            'id' => $userId,
            'email' => $email,
            'role' => 'admin',
            'status' => 'approved',
            'password_change_required' => true,
            'password_reset_offered' => false
        ];
        $profileWrite = supabaseRequest(
            'POST',
            '/rest/v1/profiles?on_conflict=id',
            $profile,
            null,
            $supabaseServiceKey,
            ['Prefer: resolution=merge-duplicates,return=minimal']
        );
        if ($profileWrite['status'] < 200 || $profileWrite['status'] >= 300) {
            http_response_code(500);
            echo json_encode(['error' => 'Acesso criado, mas nao foi possivel configurar o perfil admin.']);
            break;
        }
        echo json_encode(['ok' => true, 'email' => $email, 'role' => 'admin', 'password_change_required' => true]);
        break;

    case 'deleteUser':
        $input = jsonInput();
        if (!requireSupabaseAdmin()) break;
        $id = rawurlencode($input['id'] ?? '');
        $response = supabaseRequest('DELETE', '/auth/v1/admin/users/' . $id, null, null, $supabaseServiceKey);
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    /* ---------- APP VERSION ---------- */
    case 'checkAppJs':
        $jsFile = __DIR__ . '/../js/app.js';
        if (file_exists($jsFile)) {
            echo json_encode(['size' => filesize($jsFile), 'mtime' => filemtime($jsFile)]);
        } else {
            echo json_encode(['size' => 0, 'mtime' => 0]);
        }
        break;

    /* ---------- SETTINGS ---------- */
    case 'saveSettings':
        if (!requireSupabaseApprovedUser()) break;
        $input = jsonInput();
        $rows = [];
        foreach ($input as $key => $value) {
            $rows[] = ['key' => $key, 'value' => $value];
        }
        $response = supabaseRequest(
            'POST',
            '/rest/v1/settings?on_conflict=key',
            $rows,
            null,
            $supabaseServiceKey,
            ['Prefer: resolution=merge-duplicates,return=minimal']
        );
        echo json_encode(['ok' => $response['status'] >= 200 && $response['status'] < 300]);
        break;

    case 'listSettings':
        $response = supabaseRequest(
            'GET',
            '/rest/v1/settings?select=key,value',
            null,
            null,
            $supabaseServiceKey
        );
        $settings = [];
        foreach (($response['body'] ?? []) as $row) {
            $settings[$row['key']] = $row['value'];
        }
        echo json_encode($settings);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Unknown action']);
}
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database/Server Error: ' . $e->getMessage()]);
}
