module.exports = {
	discord: {
		botToken: "",
		clientId: "1119424948205793452",
		clientSecret: "",
		callbackUrl: "https://f95bot.test/auth/discord/callback",
		guildId: "309355248575578113",
		staffRoleId: "309358485923954689",
		ownerId: "72884988374167552",
		requiredRole: "309358485923954689",
		prefix: "!",
		applicationId: "1119424948205793452"
	},
	session: {
		secret: "YOUR_SESSION_SECRET",
		expires: 7
	},
	mysql: {
		host: "localhost",
		port: 3306,
		user: "f95bot",
		password: "f95bot",
		database: "f95bot",
		runMigrations: false
	},
	warningSystem: {
		enabled: true
	},
	template: {
		watch: false,
		noCache: false,
		undefined: true,
		stripWhitespace: true
	},
	cors: {
		enabled: false
	},
	femboy: {
		apiKey: "anonymous",
		userId: "9455",
	},
	uploadToken: "YOUR_UPLOAD_TOKEN",
	currencyApiKey: "YOUR_CURRENCY_API_KEY"
};

/**
 * uploadToken is used for uploading images to the zonies image hosting.
 * currencyApiKey is used for the currency conversion command. You get one from exchangeratesapi.io
 */