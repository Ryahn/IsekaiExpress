const crypto = require('crypto');
const {db} = require('../database/db');

const self = module.exports = {
	hasRole: (roleId) => (req, res, next) => {
		const userRoles = req.session.roles;
		return userRoles.includes(roleId)
			? next()
			: res.status(403).json({ message: 'Access denied. Insufficient role. Must be staff on F95Zone' });
	},

	isLoggedIn: (req, res, next) => req.isAuthenticated() ? next() : res.redirect('/login'),

	checkSessionExpiration: (req, res, next) => {
		if (!req.session || !req.session.expires) {
			return res.redirect("/auth/login");
		}

		if (Date.now() > req.session.expires) {
			return req.session.destroy((err) => {
				if (err) console.error("Session destruction error:", err);
				res.redirect("/auth/login");
			});
		}

		next();
	},

	daysToSeconds: (days) => days * 24 * 60 * 60 * 1000,

	getDiscordAvatarUrl: (userId, avatarHash) => 
		avatarHash
			? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`
			: `https://cdn.discordapp.com/embed/avatars/${userId % 5}.png`,

	generateCsrfToken: () => crypto.randomBytes(32).toString('hex'),

	logAudit: async (logEntry) => {
		try {
			await db.table('audit').insert({discord_id: logEntry.userId, action: logEntry.action, method: logEntry.method, timestamp: logEntry.timestamp});
		} catch (error) {
			console.error('Error logging audit:', error);
		}
	},

	timestamp: () => Math.floor(Date.now() / 1000),


	generateUniqueId: () => crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12),

	getRandomColor: () => Math.floor(Math.random() * 16777215).toString(16),

	calculateLevel: (xp) => Math.floor(0.47 * Math.sqrt(xp)),

	calculateXPForNextLevel: (currentLevel) => Math.ceil(Math.pow((currentLevel + 1) / 0.47, 2)),
};
