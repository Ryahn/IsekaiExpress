const express = require("express");
const session = require("express-session");
const passport = require("passport");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");
const bodyParser = require("body-parser");
const path = require('path');
const { getDiscordAvatarUrl, timestamp, logAudit, checkSessionExpiration } = require('../../libs/utils');
const nunjucks = require('nunjucks');
const config = require('../../config');
const logger = require('silly-logger');

logger.startup('Web Panel is starting....')

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisClient = createClient({ url: redisUrl });

let redisStore = new RedisStore({
  client: redisClient,
  prefix: "f95bot:",
});

const app = express();

nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true,                            // Escape variables by default
  express: app,                                // Connect with Express
  watch: config.template.watch,                // Watch for file changes (dev environment)
  noCache: config.template.noCache,            // Disable caching of templates
  throwOnUndefined: config.template.undefined, // Do not throw on undefined variables
  trimBlocks: config.template.trimBlocks,      // Trim newline after block tags
  lstripBlocks: config.template.lstripBlocks,  // Strip leading spaces in block tags
});

app.use(
  session({
    store: redisStore,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use(
  '/public/cards',
  express.static(path.join(__dirname, '../bot/media/cards')),
);
app.use('/public', express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "njk");

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => {
    const { email, accessToken, ...safeUser } = user;
    done(null, safeUser);
  });

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  if (req.method !== 'GET') {
    const { method, originalUrl } = req;
    const userId = req.session && req.session.user ? req.session.user.id : 9007;

    logAudit({
      userId,
      action: originalUrl,
      method,
      timestamp: timestamp(),
    });
  }
  next();
});

app.use((req, res, next) => {
  if (
    req.path.startsWith('/public') ||
    req.path === '/auth/login' ||
    req.path === '/auth/discord/callback' ||
    req.path === '/docs/farm'
  ) {
    return next();
  }
  return checkSessionExpiration(req, res, next);
});

app.get('/docs/farm', (req, res) => {
  const { crops, formatTime, calculateSlotPrice } = require('../bot/utils/farm/cropManager');
  const cropList = Object.entries(crops)
    .map(([id, c]) => {
      const hours = c.growthTime / (60 * 60 * 1000);
      return {
        id,
        displayName: c.displayName,
        yield: c.yield,
        growthMs: c.growthTime,
        growthLabel: formatTime(c.growthTime),
        growthHours: hours,
        yieldPerHour: hours > 0 ? Math.round((c.yield / hours) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => a.growthMs - b.growthMs);

  const expandExamples = [9, 10, 49, 50, 99].map((slots) => ({
    slots,
    nextPrice: calculateSlotPrice(slots),
  }));

  res.render('farmDocs', {
    cropList,
    expandExamples,
    publicBaseUrl: config.url,
    docYear: new Date().getFullYear(),
  });
});

const indexRouter = require("./routes/routerIndex");
app.use("/", indexRouter);

app.get('/', (req, res) => {
  res.render('index', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});

async function start() {
  try {
    await redisClient.connect();
    logger.startup('Connected to Redis server');
  } catch (err) {
    logger.error('Redis connection failed', err);
    process.exit(1);
  }
  app.listen(config.port, () => logger.startup(`Web panel started. Running on port ${config.port}`));
}

start();
