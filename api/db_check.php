<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Disable database lazy-load check to force database connection
$_GET['action'] = 'force_db_check'; 
require_once __DIR__ . '/config.php';

$report = [
    'db_connected' => false,
    'error' => null,
    'tables' => [],
    'users_summary' => []
];

if (isset($pdo)) {
    $report['db_connected'] = true;
    
    // Check tables
    $tables = ['players', 'matches', 'users'];
    foreach ($tables as $table) {
        try {
            $stmt = $pdo->query("SELECT 1 FROM $table LIMIT 1");
            $report['tables'][$table] = 'exists';
        } catch (PDOException $e) {
            $report['tables'][$table] = 'missing (Error: ' . $e->getMessage() . ')';
        }
    }
    
    // Check users
    if ($report['tables']['users'] === 'exists') {
        try {
            $stmt = $pdo->query("SELECT id, email, role, status, created_at FROM users");
            $report['users_summary'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            $report['users_summary'] = 'Error reading users: ' . $e->getMessage();
        }
    }
} else {
    $report['error'] = 'PDO variable $pdo was not initialized.';
}

echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
