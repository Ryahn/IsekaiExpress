const express = require("express");
const session = require("express-session");
const passport = require("passport");
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const path = require('path');
const { getDiscordAvatarUrl, timestamp, logAudit } = require('./libs/utils');
const nunjucks = require('nunjucks');
const config = require('../.config');

// Create a Redis client
let redisClient = createClient();
redisClient.connect().catch(console.error);

let redisStore = new RedisStore({
  client: redisClient,
  prefix: "f95bot:",
});

const app = express();

nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true,        // Escape variables by default
  express: app,            // Connect with Express
  watch: config.template.watch,             // Watch for file changes (dev environment)
  noCache: config.template.noCache,           // Disable caching of templates
  throwOnUndefined: config.template.undefined, // Do not throw on undefined variables
  trimBlocks: config.template.trimBlocks,        // Trim newline after block tags
  lstripBlocks: config.template.lstripBlocks,      // Strip leading spaces in block tags
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

app.use('/public', express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'views'));
app.set("view engine", "njk");

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => {
    // Remove email and access_token
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


const indexRouter = require("./routerIndex");

// Use the index router
app.use("/", indexRouter);

app.use((req, res, next) => {
  if (req.path === "/auth/login" || req.path === "/auth/discord/callback") {
    return next(); // Skip the check for these routes
  }

  if (req.session && req.session.expires) {
    if (Date.now() > req.session.expires) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destruction error:", err);
        }
        return res.redirect("/auth/login");
      });
    } else {
      next();
    }
  } else {
    return res.redirect("/auth/login");
  }
});

app.get('/', (req, res) => {
  res.render('index', { username: req.session.user.username,  avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar), csrfToken: req.session.csrf });
});


app.listen(config.port, () => console.log(`Web panel running on port ${config.port}`));
