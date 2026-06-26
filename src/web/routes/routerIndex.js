const express = require('express');
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const config = require('../../../config');
const router = express.Router();
const routesPath = path.join(__dirname);
const ROLE_REVALIDATE_MS = 2 * 60 * 1000;
const rest = new REST({ version: '10' }).setToken(config.discord.botToken);

const checkRoles = (requiredRoles) => {
  return async (req, res, next) => {
    if (!requiredRoles || requiredRoles.length === 0) {
      return next();
    }

    if (!req.session?.user?.id) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const now = Date.now();
    const rolesValidatedAt = Number(req.session.rolesValidatedAt || 0);
    if (!Array.isArray(req.session.roles) || now - rolesValidatedAt > ROLE_REVALIDATE_MS) {
      try {
        const member = await rest.get(Routes.guildMember(config.discord.guildId, req.session.user.id));
        req.session.roles = Array.isArray(member.roles) ? member.roles : [];
        req.session.rolesValidatedAt = now;
      } catch (error) {
        return req.session.destroy(() => {
          res.status(403).json({ message: 'Access denied. Please sign in again.' });
        });
      }
    }

    const userRoles = Array.isArray(req.session.roles) ? req.session.roles : [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
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
