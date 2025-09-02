// config/.config.js
const isProd = process.env.NODE_ENV === "production";

// Helper: Number from env with fallback
const envNum = (name, fallback) => {
	const v = process.env[name];
	return v != null && v !== "" ? Number(v) : fallback;
};

// ---- Base URL / ports ----
const PORT = envNum("WEB_PORT", 3000);
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

// ---- MySQL ----
const MYSQL_HOST = process.env.MYSQL_HOST || "mysql";
const MYSQL_PORT = envNum("MYSQL_PORT", 3306);

// ---- Redis ----
const REDIS_HOST = process.env.REDIS_HOST || "redis";
const REDIS_PORT = envNum("REDIS_PORT", 6379);

const self = (module.exports = {
	port: PORT,
	url: BASE_URL,

	paths: {
		root: __dirname,
	},

	discord: {
		botToken: process.env.DISCORD_BOT_TOKEN || "",
		clientId: process.env.DISCORD_CLIENT_ID || "",
		clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
		guildId: process.env.DISCORD_GUILD_ID || "309355248575578113",
		ownerId: process.env.DISCORD_OWNER_ID || "72884988374167552",
		prefix: process.env.DISCORD_PREFIX || "!",
		applicationId: process.env.DISCORD_APPLICATION_ID || "",
	},

	session: {
		secret: process.env.SESSION_SECRET || "",
		// expires in days
		expires: envNum("SESSION_EXPIRES_DAYS", 7),
		cookieSecure: isProd,
		sameSite: "lax",
	},

	// ---- MySQL ----
	mysql: {
		host: MYSQL_HOST,
		port: MYSQL_PORT,
		user: process.env.MYSQL_USER || "",
		password: process.env.MYSQL_PASSWORD || "",
		database: process.env.MYSQL_DATABASE || "",
		runMigrations: true,
	},

	// ---- Redis ----
	redis: {
		host: REDIS_HOST,
		port: REDIS_PORT,
		// password: process.env.REDIS_PASSWORD || undefined,
		keyPrefix: "f95bot:",
		connectTimeoutMs: envNum("REDIS_CONNECT_TIMEOUT_MS", 10000),
	},

	warningSystem: {
		enabled: true,
	},

	imageArchive: {
		enabled: false,
		uploadToken: process.env.IMAGE_ARCHIVE_TOKEN || "",
	},

	channelStats: {
		enabled: false,
	},

	// Nunjucks/template flags
	template: {
		watch: !isProd, // watch in dev
		noCache: !isProd, // noCache in dev
		undefined: true,
		trimBlocks: true,
		lstripBlocks: true,
	},

	cors: {
		enabled: false,
	},

	femboy: {
		apiKey: process.env.FEMBOY_API_KEY || "anonymous",
		userId: process.env.FEMBOY_USER_ID || "9455",
	},

	youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
	currencyApiKey: process.env.CURRENCY_API_KEY || "",

	roles: {
		staff: "309358485923954689",
		mod: "358471651341631493",
		uploader: "310169483169890306",
		user: "310014217975758849",
	},

	emojis: {
		power: "⚡️",
		level: "⚔️",
		star: "⭐",
		class: "📕",
		rarity: "💎",
		type: "🛡️",
	},

	kraken: {
		api_key: process.env.KRAKEN_API_KEY || "",
		api_secret: process.env.KRAKEN_API_SECRET || "",
		api_url: process.env.KRAKEN_API_URL || "https://api.kraken.com",
	},
});

self.cardUrl = `${self.url}/cards`;
self.discord.callbackUrl = `${self.url}/auth/discord/callback`;

// Derive cookie maxAge from "expires" (in days) for express-session
self.session.cookieMaxAgeMs =
	(self.session.expires && Number(self.session.expires) > 0
		? Number(self.session.expires)
		: 7) *
	24 *
	60 *
	60 *
	1000;
