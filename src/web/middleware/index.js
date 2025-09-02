/**
 * Middleware index - exports all middleware classes
 */

const RedisMiddleware = require("./redisMiddleware");
const SessionMiddleware = require("./sessionMiddleware");
const PassportMiddleware = require("./passportMiddleware");
const AuditMiddleware = require("./auditMiddleware");
const AuthMiddleware = require("./authMiddleware");
const StaticMiddleware = require("./staticMiddleware");

module.exports = {
  RedisMiddleware,
  SessionMiddleware,
  PassportMiddleware,
  AuditMiddleware,
  AuthMiddleware,
  StaticMiddleware
};
