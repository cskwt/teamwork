<?php
require_once __DIR__ . '/../hostinger-api/whatsapp-lib.php';
function check($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
    echo "PASS: $message\n";
}
$base = ['orders' => [['id' => 'one', 'departmentId' => 'a', 'updatedAt' => '2026-01-01', 'comments' => [], 'artworkApprovals' => [['id' => 'approval', 'status' => 'pending']]]], 'users' => [['id' => 'user', 'fullName' => 'Before']], 'notifications' => []];
$edited = $base;
$edited['orders'][0]['artworkApprovals'][0]['status'] = 'approved';
$edited['orders'][0]['comments'][] = ['id' => 'customer', 'text' => 'Approved'];
$edited['notifications'][] = ['id' => 'reply', 'read' => false];
$current = $base;
$current['orders'][0]['departmentId'] = 'b';
$current['orders'][0]['comments'][] = ['id' => 'staff', 'text' => 'Existing'];
$current['orders'][] = ['id' => 'two'];
$current['users'][0]['fullName'] = 'New name';
$merged = twMergeStatePatch($base, $edited, $current);
check(count($merged['orders']) === 2, 'another user’s new order is retained');
check($merged['orders'][0]['departmentId'] === 'b', 'concurrent transfer is retained');
check(count($merged['orders'][0]['comments']) === 2, 'concurrent comments are retained');
check($merged['orders'][0]['artworkApprovals'][0]['status'] === 'approved', 'customer decision is applied');
check($merged['users'][0]['fullName'] === 'New name', 'profile changes are retained');
$current['orders'][0]['purgedAt'] = '2026-01-03';
$purged = twMergeStatePatch($base, $edited, $current);
check($purged['orders'][0] === $current['orders'][0], 'purged order cannot be recreated by a late reply');
$current['orders'] = [['id' => 'two']];
$removed = twMergeStatePatch($base, $edited, $current);
check(count($removed['orders']) === 1 && $removed['orders'][0]['id'] === 'two', 'removed order remains absent');
