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

    /* ---------- ADMIN ---------- */
    case 'adminLogin':
        $input = jsonInput();
        $stmt = $pdo->prepare('SELECT id, email, password FROM admin WHERE email = ?');
        $stmt->execute([$input['email']]);
        $admin = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($admin && password_verify($input['password'], $admin['password'])) {
            echo json_encode(['ok' => true, 'email' => $admin['email']]);
        } else {
            http_response_code(401);
            echo json_encode(['error' => 'E-mail ou senha incorretos.']);
        }
        break;

    case 'adminRegister':
        $input = jsonInput();
        $stmt = $pdo->prepare('SELECT id FROM admin WHERE email = ?');
        $stmt->execute([$input['email']]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'E-mail j\u00e1 cadastrado.']);
            break;
        }
        $hash = password_hash($input['password'], PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('INSERT INTO admin (email, password) VALUES (?, ?)');
        $stmt->execute([$input['email'], $hash]);
        echo json_encode(['ok' => true, 'email' => $input['email']]);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Unknown action']);
}
