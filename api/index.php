<?php
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

try {
switch ($action) {

    /* ---------- PLAYERS ---------- */
    case 'listPlayers':
        $stmt = $pdo->query('SELECT id, name, photo FROM players ORDER BY name');
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'savePlayers':
        $input = jsonInput();
        $players = $input['players'] ?? [];
        $pdo->beginTransaction();
        try {
            $existing = $pdo->query('SELECT id FROM players')->fetchAll(PDO::FETCH_COLUMN);
            $incoming = array_map(fn($p) => $p['id'], $players);
            
            // Delete players not in incoming list
            $toDelete = array_diff($existing, $incoming);
            if ($toDelete) {
                $stmt = $pdo->prepare('DELETE FROM players WHERE id = ?');
                foreach ($toDelete as $id) {
                    $stmt->execute([$id]);
                }
            }
            
            // Insert or update players using SQLite's native upsert syntax.
            $stmt = $pdo->prepare('INSERT INTO players (id, name, photo, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, photo = excluded.photo');
            foreach ($players as $player) {
                $stmt->execute([$player['id'], $player['name'], $player['photo'] ?? null, date('Y-m-d H:i:s')]);
            }
            
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    /* ---------- MATCHES ---------- */
    case 'listMatches':
        $stmt = $pdo->query('SELECT id, date, team_a, team_b, score_a, score_b, winner, buchuda, buchuda_de_re, duration_sec FROM matches ORDER BY DATE(date) DESC, id DESC');
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$r) {
            $r['team_a'] = json_decode($r['team_a'], true);
            $r['team_b'] = json_decode($r['team_b'], true);
            $r['buchuda'] = (bool) $r['buchuda'];
            $r['buchuda_de_re'] = (bool) $r['buchuda_de_re'];
            $r['score_a'] = (int) $r['score_a'];
            $r['score_b'] = (int) $r['score_b'];
            $r['duration_sec'] = $r['duration_sec'] ? (int) $r['duration_sec'] : null;
            $r['date'] = $r['date'] ? str_replace(' ', 'T', $r['date']) : null;
        }
        echo json_encode($rows);
        break;

    case 'saveMatches':
        $input = jsonInput();
        $matches = $input['matches'] ?? [];
        $pdo->beginTransaction();
        try {
            $existing = $pdo->query('SELECT id FROM matches')->fetchAll(PDO::FETCH_COLUMN);
            $incoming = array_map(fn($m) => $m['id'], $matches);
            $toDelete = array_diff($existing, $incoming);
            if ($toDelete) {
                $placeholders = implode(',', array_fill(0, count($toDelete), '?'));
                $pdo->prepare("DELETE FROM matches WHERE id IN ($placeholders)")->execute(array_values($toDelete));
            }
            $stmt = $pdo->prepare('INSERT INTO matches (id, date, team_a, team_b, score_a, score_b, winner, buchuda, buchuda_de_re, duration_sec, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, team_a = excluded.team_a, team_b = excluded.team_b, score_a = excluded.score_a, score_b = excluded.score_b, winner = excluded.winner, buchuda = excluded.buchuda, buchuda_de_re = excluded.buchuda_de_re, duration_sec = excluded.duration_sec');
            foreach ($matches as $m) {
                // A data da partida é uma data de jogo, não a hora de gravação.
                // Ao receber uma data manual válida, preservamos o dia escolhido
                // pelo usuário e usamos meio-dia para evitar mudança de dia por fuso.
                $rawDate = (string) ($m['date'] ?? '');
                $matchDate = preg_match('/^\d{4}-\d{2}-\d{2}/', $rawDate)
                    ? substr($rawDate, 0, 10) . ' 12:00:00'
                    : $rawDate;
                $stmt->execute([
                    $m['id'], $matchDate, json_encode($m['teamA']), json_encode($m['teamB']),
                    $m['scoreA'], $m['scoreB'], $m['winner'],
                    !empty($m['buchuda']) ? 1 : 0, !empty($m['buchudaDeRe']) ? 1 : 0,
                    $m['durationSec'] ?? 0, date('Y-m-d H:i:s')
                ]);
            }
            $pdo->commit();
            echo json_encode(['ok' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    case 'deleteMatch':
        $input = jsonInput();
        $id = $input['id'] ?? '';
        if ($id === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing id']);
            break;
        }
        $stmt = $pdo->prepare('DELETE FROM matches WHERE id = ?');
        $stmt->execute([$id]);
        $backupFile = __DIR__ . '/../data/backup.json';
        if (file_exists($backupFile)) {
            $backup = json_decode(file_get_contents($backupFile), true);
            if (isset($backup['matches']) && is_array($backup['matches'])) {
                $backup['matches'] = array_values(array_filter($backup['matches'], fn($m) => ($m['id'] ?? null) !== $id));
                $backup['timestamp'] = date('Y-m-d H:i:s');
                file_put_contents($backupFile, json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }
        }
        echo json_encode(['ok' => true]);
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
            'status' => 'pending'
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
            $profile = supabaseProfileByEmail($input['email'] ?? '');
            if ($profile && empty($profile['password_reset_offered'])) {
                $marked = supabaseRequest(
                    'PATCH',
                    '/rest/v1/profiles?id=eq.' . rawurlencode($profile['id']),
                    ['password_reset_offered' => true],
                    null,
                    $supabaseServiceKey,
                    ['Prefer: return=minimal']
                );
                if ($marked['status'] >= 200 && $marked['status'] < 300) {
                    http_response_code(401);
                    echo json_encode([
                        'error' => 'Senha incorreta. Deseja receber um link para criar uma nova senha?',
                        'password_reset_available' => true
                    ]);
                    break;
                }
            }
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
            'access_token' => $auth['body']['access_token'] ?? null,
            'refresh_token' => $auth['body']['refresh_token'] ?? null,
            'expires_in' => $auth['body']['expires_in'] ?? null
        ]);
        break;

    case 'session':
        $profile = supabaseCurrentProfile();
        if (!$profile || $profile['status'] !== 'approved') {
            http_response_code(401);
            echo json_encode(['error' => 'Sessão inválida.']);
            break;
        }
        echo json_encode(['ok' => true, 'email' => $profile['email'], 'role' => $profile['role']]);
        break;

    case 'logout':
        echo json_encode(['ok' => true]);
        break;

    case 'requestPasswordReset':
        $input = jsonInput();
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $profile = supabaseProfileByEmail($email);
        if (!$profile || empty($profile['password_reset_offered'])) {
            echo json_encode(['ok' => false, 'message' => 'Não foi possível solicitar a recuperação.']);
            break;
        }
        $reset = supabaseRequest(
            'POST',
            '/auth/v1/recover',
            ['email' => $email],
            null,
            $supabasePublishableKey
        );
        echo json_encode([
            'ok' => $reset['status'] >= 200 && $reset['status'] < 300,
            'message' => 'Se o e-mail estiver cadastrado, o link de recuperação será enviado.'
        ]);
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
        $input = jsonInput();
        $backupDir = __DIR__ . '/../data';
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        file_put_contents(
            $backupDir . '/settings.json',
            json_encode($input, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );
        echo json_encode(['ok' => true]);
        break;

    case 'listSettings':
        $file = __DIR__ . '/../data/settings.json';
        if (file_exists($file)) {
            echo file_get_contents($file);
        } else {
            echo json_encode((object)[]);
        }
        break;

    /* ---------- BACKUP ---------- */
    case 'saveBackup':
        $input = jsonInput();
        $backupDir = __DIR__ . '/../data';
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        $backup = [
            'timestamp' => date('Y-m-d H:i:s'),
            'players' => $input['players'] ?? [],
            'matches' => $input['matches'] ?? []
        ];
        file_put_contents(
            $backupDir . '/backup.json',
            json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );
        echo json_encode(['ok' => true]);
        break;

    case 'listBackup':
        $backupFile = __DIR__ . '/../data/backup.json';
        if (file_exists($backupFile)) {
            echo file_get_contents($backupFile);
        } else {
            echo json_encode(['timestamp' => null, 'players' => [], 'matches' => []]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Unknown action']);
}
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database/Server Error: ' . $e->getMessage()]);
}
