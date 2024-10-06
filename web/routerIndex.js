const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const routesPath = path.join(__dirname, 'routes');

const checkRoles = (requiredRoles) => {
  return (req, res, next) => {
    const userRoles = req.session.roles ? req.session.roles : [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
    
    if (hasRequiredRole) {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
  };
};

fs.readdirSync(routesPath).forEach(file => {
  if (file.endsWith('.js')) {
    const route = '/' + file.slice(0, -3);
    const routeFile = require(path.join(routesPath, file));
    const requiredRoles = routeFile.requiredRoles || [];
    router.use(route, checkRoles(requiredRoles), routeFile.router || routeFile);
  }
});

module.exports = router;
