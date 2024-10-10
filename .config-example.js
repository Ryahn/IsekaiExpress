module.exports = {
	// The port the web panel will run on
	port: 3000,
	discord: {
		// Your discord bot token
		botToken: "",
		// Your discord client id
		clientId: "1119424948205793452",
		// Your discord client secret
		clientSecret: "",
		// Your discord callback url
		callbackUrl: "https://f95bot.test/auth/discord/callback",
		// Your discord guild id
		guildId: "309355248575578113",
		// The role that is required to use the image archive
		requiredRole: "309358485923954689",
		// The prefix for the bot
		prefix: "!",
		// Your discord application id
		applicationId: "1119424948205793452"
	},
	session: {
		// The secret for the session
		secret: "YOUR_SESSION_SECRET",
		// The amount of days the session will last
		expires: 7
	},
	mysql: {
		// The host for the mysql database
		host: "localhost",
		// The port for the mysql database
		port: 3306,
		// The user for the mysql database
		user: "NOTSET",
		// The password for the mysql database
		password: "NOTSET",
		// The database for the mysql database
		database: "NOTSET",
		// Whether to run the migrations
		runMigrations: false
	},
	warningSystem: {
		// Whether to enable the warning system
		enabled: true
	},
	imageArchive: {
		// Whether to enable the image archive
		enabled: true,
		// The token for the image archive
		uploadToken: "YOUR_UPLOAD_TOKEN",
	},
	template: {
		// Whether to watch the template files
		watch: false,
		// Whether to cache the template files
		noCache: false,
		// Whether to use undefined variables
		undefined: true,
		// Whether to strip the whitespace
		stripWhitespace: true
	},
	cors: {
		// Whether to enable cors
		enabled: false
	},
	femboy: {
		// The api key for the femboy api
		apiKey: "anonymous",
		// The user id for the femboy api
		userId: "9455",
	},
	// The api key for the currency api
	currencyApiKey: "YOUR_CURRENCY_API_KEY"
};