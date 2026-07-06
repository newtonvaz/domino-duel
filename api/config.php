<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$host = getenv('DB_HOST') ?: 'sql.freedev.app';
$db   = getenv('DB_NAME') ?: 'dominoduel';
$user = getenv('DB_USER') ?: 'dominoduel';
$pass = getenv('DB_PASS') ?: 'your_password_here';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

function jsonInput() {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}
