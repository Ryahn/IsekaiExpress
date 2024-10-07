const crypto = require('crypto');

const self = module.exports = {
	generateUniqueId: () => {
		return crypto.randomBytes(9).toString('base64').replace(/\//g, '_').replace(/\+/g, '-').substr(0, 12);
	},

	getRandomColor: () => {
		return Math.floor(Math.random() * 16777215).toString(16);
	},

	timestamp: () => { return Math.floor(Date.now() / 1000); },

};