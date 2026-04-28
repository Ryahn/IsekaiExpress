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
const logger = require('../../libs/logger');

logger.startup('Web Panel is starting....')

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisClient = createClient({ url: redisUrl });

let redisStore = new RedisStore({
  client: redisClient,
  prefix: "f95bot:",
});

const app = express();

nunjucks.configure([
  path.join(__dirname, 'views'),
  path.join(__dirname, '../char_voting/views'),
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
    cookie: { secure: false },
  })
);

app.use(
  '/public/cards',
  express.static(path.join(__dirname, '../bot/media/cards')),
);
app.use('/public', express.static(path.join(__dirname, "public")));
app.use('/char_voting/uploads', express.static(path.join(__dirname, '../char_voting/uploads')));
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
    req.path === '/docs/farm' ||
    req.path.startsWith('/stats/') ||
    req.path.startsWith('/char_voting')
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
