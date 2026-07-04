const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const passport = require("passport");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");
const bodyParser = require("body-parser");
const path = require('path');
const { getDiscordAvatarUrl, timestamp, logAudit, checkSessionExpiration, daysToSeconds } = require('../../libs/utils');
const nunjucks = require('nunjucks');
const config = require('../../config');
const logger = require('../../libs/logger');
const appDb = require('../../database/db');
const requireCsrf = require('./middleware/requireCsrf');

logger.startup('Web Panel is starting....')

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' },
});

const listApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

const mutatingRouteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: { message: 'Too many changes requested. Please try again later.' },
});

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisClient = createClient({ url: redisUrl });

let redisStore = new RedisStore({
  client: redisClient,
  prefix: "f95bot:",
});

const app = express();
let server = null;
let shuttingDown = false;

function shouldSendJsonError(req) {
  return (
    req.xhr ||
    req.method !== 'GET' ||
    req.path === '/commands/list' ||
    req.path === '/commands/slashes/list' ||
    req.path === '/commands/chat/list' ||
    req.path === '/warnings/list' ||
    req.path.startsWith('/api/')
  );
}

// Security headers. CSP is intentionally disabled: templates use inline scripts/styles and
// vendored assets (leaflet, fontawesome, dhtmlx, lodash), which a strict CSP would break. The
// remaining helmet defaults (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS, etc.)
// are safe and add value. Revisit a tailored CSP separately if inline assets are removed.
app.use(helmet({ contentSecurityPolicy: false }));
// Behind the Traefik TLS proxy; needed for correct protocol/IP detection and secure cookies.
app.set('trust proxy', 1);

nunjucks.configure([
  path.join(__dirname, 'views'),
], {
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
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // allows the cookie on the top-level OAuth callback redirect
      secure: config.session.cookieSecure,
      maxAge: daysToSeconds(config.session.expires),
    },
  })
);

app.use('/public', express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "njk");

app.use(['/auth/login', '/auth/discord/callback'], authRateLimiter);
app.use(['/commands/list', '/commands/slashes/list', '/commands/chat/list', '/warnings/list'], listApiRateLimiter);
app.use(mutatingRouteRateLimiter);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => {
    const { email, accessToken, ...safeUser } = user;
    done(null, safeUser);
  });

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  if (req.session && req.session.user) {
    const roles = req.session.roles;
    res.locals.showModCommandDocs = Array.isArray(roles) &&
      (roles.includes(config.roles.staff) || roles.includes(config.roles.mod));
  } else {
    res.locals.showModCommandDocs = false;
  }
  next();
});

app.use((req, res, next) => {
  if (
    req.path.startsWith('/public') ||
    req.path === '/auth/login' ||
    req.path === '/auth/discord/callback' ||
    req.path === '/docs/farm' ||
    req.path.startsWith('/stats/')
  ) {
    return next();
  }
  return checkSessionExpiration(req, res, next);
});

app.use(requireCsrf);

app.use((req, res, next) => {
  const shouldAudit =
    req.method !== 'GET' &&
    req.method !== 'HEAD' &&
    req.method !== 'OPTIONS' &&
    req.session &&
    req.session.user;

  if (!shouldAudit) {
    return next();
  }

  const { method, originalUrl } = req;
  const userId = req.session.user.id;
  res.on('finish', () => {
    if (res.statusCode < 400) {
      logAudit({
        userId,
        action: originalUrl,
        method,
        timestamp: timestamp(),
      });
      return;
    }
    logger.warn(`Denied authenticated mutation: user=${userId} method=${method} path=${originalUrl} status=${res.statusCode}`);
  });
  next();
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

function farmerDisplayName(username, discordUserId) {
  if (username && String(username).trim()) {
    return String(username).trim();
  }
  const id = String(discordUserId || '');
  const tail = id.length >= 4 ? id.slice(-4) : id;
  return tail ? `Farmer ·${tail}` : 'Farmer';
}

app.get('/stats/farm', async (req, res, next) => {
  const db = require('../../database/db').query;
  try {
    const TOP = 10;
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    let globalStats = {
      total_harvest_units: 0,
      total_plant_actions: 0,
      total_shop_seed_units_bought: 0,
      total_seed_units_bought_while_planting: 0,
      total_crop_units_sold: 0,
      total_land_expansions: 0,
    };
    if (await db.schema.hasTable('farm_global_stats')) {
      const row = await db('farm_global_stats').where({ id: 1 }).first();
      if (row) {
        globalStats = { ...globalStats, ...row };
      }
    }
    const countRow = await db('farm_profiles').count('* as c').first();
    const farmerCount = Number(countRow ? Object.values(countRow)[0] : 0);

    const hasFarmXpCol = await db.schema.hasColumn('farm_profiles', 'farm_xp');
    const farmXpValSql = hasFarmXpCol
      ? db.raw('COALESCE(fp.farm_xp, 0) as farm_xp_val')
      : db.raw('(COALESCE(fp.experience, 0) * 10) as farm_xp_val');

    const topMoneyRows = await db('farm_profiles as fp')
      .leftJoin('users as u', 'u.discord_id', 'fp.discord_user_id')
      .select('fp.discord_user_id', 'fp.money', 'u.username')
      .select(farmXpValSql)
      .orderBy('fp.money', 'desc')
      .orderBy('fp.discord_user_id', 'asc')
      .limit(TOP);

    const topXpQ = db('farm_profiles as fp')
      .leftJoin('users as u', 'u.discord_id', 'fp.discord_user_id')
      .select('fp.discord_user_id', 'fp.money', 'u.username')
      .select(farmXpValSql);
    if (hasFarmXpCol) {
      topXpQ.orderByRaw('COALESCE(fp.farm_xp, 0) DESC');
    }
    else {
      topXpQ.orderByRaw('(COALESCE(fp.experience, 0) * 10) DESC');
    }
    const topXpRows = await topXpQ
      .orderBy('fp.discord_user_id', 'asc')
      .limit(TOP);

    const farmXpFromRow = (r) => {
      const v = r.farm_xp_val;
      return v != null ? Number(v) : 0;
    };

    const topMoney = topMoneyRows.map((r, i) => ({
      rank: i + 1,
      displayName: farmerDisplayName(r.username, r.discord_user_id),
      moneyLabel: fmt(r.money),
      farmXpLabel: fmt(farmXpFromRow(r)),
    }));
    const topFarmXp = topXpRows.map((r, i) => ({
      rank: i + 1,
      displayName: farmerDisplayName(r.username, r.discord_user_id),
      moneyLabel: fmt(r.money),
      farmXpLabel: fmt(farmXpFromRow(r)),
    }));

    res.render('farmStats', {
      publicBaseUrl: config.url,
      docYear: new Date().getFullYear(),
      farmerCountLabel: fmt(farmerCount),
      globalStats: {
        totalHarvest: fmt(globalStats.total_harvest_units),
        totalPlant: fmt(globalStats.total_plant_actions),
        shopBought: fmt(globalStats.total_shop_seed_units_bought),
        plantBought: fmt(globalStats.total_seed_units_bought_while_planting),
        totalSold: fmt(globalStats.total_crop_units_sold),
        landExpansions: fmt(globalStats.total_land_expansions),
      },
      topMoney,
      topFarmXp,
    });
  } catch (err) {
    logger.error('Farm stats page failed', err);
    next(err);
  }
});

const indexRouter = require("./routes/routerIndex");
app.use("/", indexRouter);

app.get('/', (req, res) => {
  res.render('index', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});

app.use((req, res) => {
  if (shouldSendJsonError(req)) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.status(404).send('Not found');
});

app.use((err, req, res, next) => {
  logger.error('Unhandled web route error', err);
  if (res.headersSent) {
    return next(err);
  }
  if (shouldSendJsonError(req)) {
    return res.status(500).json({ message: 'Internal server error' });
  }
  res.status(500).send('Internal server error');
});

async function start() {
  if (!config.session.secret) {
    logger.error('Missing required environment variable: SESSION_SECRET. Set it in .env (see .env.example).');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && !config.session.cookieSecure) {
    logger.error('SESSION_COOKIE_SECURE must be true when NODE_ENV=production.');
    process.exit(1);
  }
  try {
    await redisClient.connect();
    logger.startup('Connected to Redis server');
  } catch (err) {
    logger.error('Redis connection failed', err);
    process.exit(1);
  }
  server = app.listen(config.port, () => logger.startup(`Web panel started. Running on port ${config.port}`));
}

start();

async function closeHttpServer() {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    logger.warn(`Received ${signal} while web shutdown is already in progress.`);
    return;
  }
  shuttingDown = true;
  logger.info(`Received ${signal}. Shutting down web panel gracefully...`);

  try {
    await closeHttpServer();
  } catch (err) {
    logger.error('Error closing HTTP server:', err);
  }

  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (err) {
    logger.error('Error closing Redis client:', err);
  }

  try {
    await appDb.end();
  } catch (err) {
    logger.error('Error closing Knex pool:', err);
  }

  if (typeof logger.shutdownWebhook === 'function') {
    logger.shutdownWebhook();
  }

  process.exit(0);
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
