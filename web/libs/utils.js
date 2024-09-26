const crypto = require('crypto');
const db = require('./database/db');

const self = module.exports = {
	hasRole: (roleId) => {
		return (req, res, next) => {
		  const userRoles = req.session.roles; // Example assuming guild roles are in req.user
	  
		  // Check if user has the required role
		  if (userRoles.includes(roleId)) {
			return next();
		  } else {
			return res.status(403).json({ message: 'Access denied. Insufficient role. Must be staff on F95Zone' });
		  }
		};
	  },
	isLoggedIn: (req, res, next) => {
	if (req.isAuthenticated()) return next();
	res.redirect('/login');
  },

  checkSessionExpiration: (req, res, next) => {
	if (req.session && req.session.expires) {
	  // Check if the session has expired
	  if (Date.now() > req.session.expires) {
		// Session has expired, destroy the session and redirect to login
		req.session.destroy((err) => {
		  if (err) {
			console.error("Session destruction error:", err);
		  }
		  return res.redirect("/auth/login"); // Redirect to the login page
		});
	  } else {
		// Session is valid, allow request to proceed
		return next();
	  }
	} else {
	  // No session or expires is missing, redirect to login
	  return res.redirect("/auth/login");
	}
  },

  daysToSeconds: (days) => {
	return days * 24 * 60 * 60 * 1000;
  },

  getDiscordAvatarUrl: (userId, avatarHash) => {
    if (!avatarHash) {
        const defaultAvatarId = userId % 5; // Discord has 5 default avatars (0–4)
        return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarId}.png`;
    }
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
},

generateCsrfToken: () => {
	return crypto.randomBytes(32).toString('hex');  // Generate a 32-byte random string
},

logAudit: (logEntry) => {
	db.query('INSERT INTO audit (discord_id, action, method, timestamp) VALUES (?, ?, ?, ?)', [logEntry.userId, logEntry.action, logEntry.method, logEntry.timestamp], (err, results, fields) => {
		if (err) {
			console.error('Error logging audit:', err);
		}
	});
},

timestamp: () => {
	return Math.floor(Date.now() / 1000);
},
generateUniqueId: () => {
	return crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12);
}
  
};