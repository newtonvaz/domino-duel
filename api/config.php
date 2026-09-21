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
$noDbActions = ['checkAppJs', 'saveSettings', 'listSettings', 'saveBackup', 'listBackup'];

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
