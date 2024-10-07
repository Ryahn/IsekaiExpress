const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const routesPath = path.join(__dirname);

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
  if (file.endsWith('.js') && file !== 'routerIndex.js') {
    const route = '/' + file.slice(0, -3);
    const routeFile = require(path.join(routesPath, file));
    const requiredRoles = routeFile.requiredRoles || [];
    
    if (typeof routeFile === 'function' || routeFile instanceof express.Router) {
      router.use(route, checkRoles(requiredRoles), routeFile);
    } else if (typeof routeFile === 'object') {
      Object.entries(routeFile).forEach(([method, handler]) => {
        if (typeof handler === 'function') {
          router[method.toLowerCase()](route, checkRoles(requiredRoles), handler);
        }
      });
    } else {
      console.warn(`Skipping file ${file}: Exported content is neither a router nor an object with route handlers`);
    }
  }
});

module.exports = router;
