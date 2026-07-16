<?php
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

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
            
            // Insert or update players
            $stmt = $pdo->prepare('INSERT INTO players (id, name, photo) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, photo = ?');
            foreach ($players as $player) {
                $stmt->execute([$player['id'], $player['name'], $player['photo'], $player['name'], $player['photo']]);
            }
            
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (PDOException $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
            $toDelete = array_diff($existing, $incoming);
            if ($toDelete) {
                $placeholders = implode(',', array_fill(0, count($toDelete), '?'));
                $pdo->prepare("DELETE FROM players WHERE id IN ($placeholders)")->execute(array_values($toDelete));
            }
            $stmt = $pdo->prepare('REPLACE INTO players (id, name, photo) VALUES (?, ?, ?)');
            foreach ($players as $p) {
                $stmt->execute([$p['id'], $p['name'], $p['photo'] ?? null]);
            }
            $pdo->commit();
            echo json_encode(['ok' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        break;

    /* ---------- MATCHES ---------- */
    case 'listMatches':
        $stmt = $pdo->query('SELECT id, date, team_a, team_b, score_a, score_b, winner, buchuda, buchuda_de_re, duration_sec FROM matches ORDER BY date DESC');
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
            $stmt = $pdo->prepare('REPLACE INTO matches (id, date, team_a, team_b, score_a, score_b, winner, buchuda, buchuda_de_re, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            foreach ($matches as $m) {
                $stmt->execute([
                    $m['id'], $m['date'], json_encode($m['teamA']), json_encode($m['teamB']),
                    $m['scoreA'], $m['scoreB'], $m['winner'],
                    $m['buchuda'] ? 1 : 0, $m['buchudaDeRe'] ? 1 : 0,
                    $m['durationSec'] ?? null
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

    /* ---------- USERS ---------- */
    case 'register':
        $input = jsonInput();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([$input['email']]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'E-mail j\u00e1 cadastrado.']);
            break;
        }
        $isFirst = $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() == 0;
        $role = $isFirst ? 'admin' : 'user';
        $status = $isFirst ? 'approved' : 'pending';
        $hash = password_hash($input['password'], PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO users (email, password, role, status) VALUES (?, ?, ?, ?)');
        $stmt->execute([$input['email'], $hash, $role, $status]);
        echo json_encode(['ok' => true, 'email' => $input['email'], 'role' => $role, 'status' => $status]);
        break;

    case 'login':
        $input = jsonInput();
        $stmt = $pdo->prepare('SELECT id, email, password, role, status FROM users WHERE email = ?');
        $stmt->execute([$input['email']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user || !password_verify($input['password'], $user['password'])) {
            http_response_code(401);
            echo json_encode(['error' => 'E-mail ou senha incorretos.']);
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
        echo json_encode(['ok' => true, 'email' => $user['email'], 'role' => $user['role']]);
        break;

    case 'listUsers':
        $stmt = $pdo->query('SELECT id, email, role, status, created_at FROM users ORDER BY created_at');
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        break;

    case 'approveUser':
        $input = jsonInput();
        $stmt = $pdo->prepare("UPDATE users SET status = 'approved' WHERE id = ? AND status = 'pending'");
        $stmt->execute([$input['id']]);
        echo json_encode(['ok' => true]);
        break;

    case 'rejectUser':
        $input = jsonInput();
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND status = 'pending'");
        $stmt->execute([$input['id']]);
        echo json_encode(['ok' => true]);
        break;

    case 'updateUserRole':
        $input = jsonInput();
        $allowed = ['admin', 'user'];
        if (!in_array($input['role'], $allowed)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid role']);
            break;
        }
        $stmt = $pdo->prepare('UPDATE users SET role = ? WHERE id = ?');
        $stmt->execute([$input['role'], $input['id']]);
        echo json_encode(['ok' => true]);
        break;

    case 'deleteUser':
        $input = jsonInput();
        $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$input['id']]);
        echo json_encode(['ok' => true]);
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
