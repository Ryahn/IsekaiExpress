const express = require("express");
const router = express.Router();
const { isLoggedIn, hasRole } = require("../libs/utils");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_BOT_TOKEN
);

router.get("/", isLoggedIn, hasRole(process.env.DISCORD_STAFF_ROLE_ID), (req, res) => {
	// res.json({ user: req.user, session: req.session });
	res.render()
});

module.exports = router;