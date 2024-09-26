const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Path to the routes directory
const routesPath = path.join(__dirname, 'routes');

// Read all the files in the routes directory
fs.readdirSync(routesPath).forEach(file => {
  // Only process files that end with .js
  if (file.endsWith('.js')) {
    // Get the route name by removing the .js extension (e.g., dashboard.js -> /dashboard)
    const route = '/' + file.slice(0, -3); // Removes the last 3 characters ('.js')

    // Dynamically require the route file
    const routeFile = require(path.join(routesPath, file));

    // Use the route (e.g., /dashboard will point to dashboard.js)
    router.use(route, routeFile);
  }
});

module.exports = router;
