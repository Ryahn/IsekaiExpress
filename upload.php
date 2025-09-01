<?php
// Define your secure token
define('SECURE_TOKEN', 'ADDSAD');

// Get the Authorization header
$headers = getallheaders();
if (!isset($headers['Authorization']) || trim($headers['Authorization']) !== 'Bearer ' . SECURE_TOKEN) {
    // If the token is missing or invalid, return an error
    http_response_code(401); // Unauthorized
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$target_dir = "/var/www/api/f/"; // Absolute path for saving files
$relative_url_path = "f/"; // The part of the path that's accessible via the web

// Handle the file upload
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['image'])) {
    $file = $_FILES['image'];

    // Generate a unique name for the image
    $file_name = uniqid() . "-" . basename($file["name"]);
    $target_file = $target_dir . $file_name; // This is the full path for saving the file
    $image_url = "https://upload.zonies.xyz/" . $relative_url_path . $file_name; // This is the URL to access the image

    // Move the uploaded file to the target directory
    if (move_uploaded_file($file["tmp_name"], $target_file)) {
        // Send back the URL of the uploaded image
        echo json_encode(['url' => $image_url]);
    } else {
        echo json_encode(['error' => 'Failed to upload image']);
    }
} else {
    echo json_encode(['error' => 'No image provided']);
}

?>
