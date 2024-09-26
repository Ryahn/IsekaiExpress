const express = require("express");
const passport = require("passport");
const { Strategy } = require("passport-discord");
const { Routes } = require("discord-api-types/v10");
const { REST } = require("@discordjs/rest");
require("dotenv").config();
const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_BOT_TOKEN
);
const router = express.Router();
const app = express();
const { daysToSeconds, generateCsrfToken } = require("../libs/utils");
const db = require("../libs/database/db");
passport.use(
	new Strategy(
	  {
		clientID: process.env.DISCORD_CLIENT_ID,
		clientSecret: process.env.DISCORD_CLIENT_SECRET,
		callbackURL: process.env.DISCORD_CALLBACK_URL,
		scope: ["identify", "guilds", "guilds.members.read"],
	  },
	  (accessToken, refreshToken, profile, done) => {
		return done(null, profile);
	  }
	)
);

router.get("/login", passport.authenticate("discord"));
router.get(
  "/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const [member, [existingUser]] = await Promise.all([
        rest.get(Routes.guildMember(process.env.DISCORD_GUILD_ID, userId)),
        db.query('SELECT * FROM users WHERE discord_id = ?', [userId])
      ]);

      req.session.roles = member.roles;
      req.session.loggedin = true;
      const { email, accessToken, ...safeUser } = req.user;
      req.session.user = safeUser;
      req.session.expires = Date.now() + daysToSeconds(process.env.SESSION_EXPIRES);
      req.session.csrf = generateCsrfToken();

      if (!existingUser) {
        await db.query('INSERT INTO users (username, discord_id) VALUES (?, ?)', [req.user.username, userId]);
      }

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
        }
        res.redirect("/");
      });
    } catch (error) {
      console.error("Error in Discord callback:", error);
      res.status(500).send("An error occurred during authentication");
    }
  }
);

router.post('/logout', (req, res) => {
	if (req.body._csrf !== req.session.csrf) {
		console.error('Invalid CSRF token');
		return res.status(403).json({ message: 'Invalid CSRF token' });
	}
	res.clearCookie('connect.sid'); 
	req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect(302, '/');
    });
});

module.exports = router;