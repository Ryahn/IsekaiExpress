const express = require("express");
const session = require("express-session");
const passport = require("passport");
require("dotenv").config({ path: "../.env" });
const RedisStore = require("connect-redis").default;
const { createClient } = require("redis");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const path = require('path');
const { getDiscordAvatarUrl, timestamp, logAudit } = require('./libs/utils');
const nunjucks = require('nunjucks');

// Create a Redis client
let redisClient = createClient();
redisClient.connect().catch(console.error);

let redisStore = new RedisStore({
  client: redisClient,
  prefix: "f95bot:",
});

const app = express();

if (process.CORS_ENABLED) {
  app.use(helmet());
}

nunjucks.configure('views', {
  autoescape: true,        // Escape variables by default
  express: app,            // Connect with Express
  watch: process.env.TEMPLTE_WATCH,             // Watch for file changes (dev environment)
  noCache: process.env.TEMPLATE_NO_CACHE,           // Disable caching of templates
  throwOnUndefined: process.env.TEMPLATE_UNDFINED, // Do not throw on undefined variables
  trimBlocks: true,        // Trim newline after block tags
  lstripBlocks: process.env.TEMPLATE_STRIP_WHITESPACE,      // Strip leading spaces in block tags
});

app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use(express.static(path.join(__dirname, "public")));
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


app.listen(3000, () => console.log("Web panel running on port 3000"));
