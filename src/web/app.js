const express = require("express");
const logger = require("silly-logger");
const config = require("../../config/.config");
const { getDiscordAvatarUrl } = require("../../libs/utils");

// Import middleware classes
const {
  RedisMiddleware,
  SessionMiddleware,
  PassportMiddleware,
  AuditMiddleware,
  AuthMiddleware,
  StaticMiddleware
} = require("./middleware");

logger.startup("Web Panel is starting...");

const app = express();

// Initialize Redis middleware
const redisMiddleware = new RedisMiddleware();
const redisClient = redisMiddleware.initialize();
await redisMiddleware.connect();

// Initialize Session middleware
const sessionMiddleware = new SessionMiddleware(redisClient);
app.use(sessionMiddleware.getMiddleware());

// Initialize Static and Template middleware
const staticMiddleware = new StaticMiddleware(app);
staticMiddleware.apply();

// Initialize Passport middleware
const passportMiddleware = new PassportMiddleware();
passportMiddleware.getAllMiddleware().forEach(middleware => {
  app.use(middleware);
});

// Initialize Audit middleware
const auditMiddleware = new AuditMiddleware();
app.use(auditMiddleware.getMiddleware());

// Routes
const indexRouter = require("./routes/routerIndex");
app.use("/", indexRouter);

// Initialize Authentication middleware
const authMiddleware = new AuthMiddleware();
app.use(authMiddleware.getMiddleware());

// Home route
app.get("/", (req, res) => {
  res.render("index", {
    username: req.session.user.username,
    avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar),
    csrfToken: req.session.csrf,
  });
});

// Start server
app.listen(config.port, () =>
  logger.startup(`Web panel started. Running on port ${config.port}`)
);
