CREATE TABLE IF NOT EXISTS Guilds (
    guildId VARCHAR(100) NOT NULL PRIMARY KEY,
    guildOwnerId VARCHAR (100) NOT NULL
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS GuildConfigurable (
    guildId VARCHAR(100) NOT NULL PRIMARY KEY,
    cmdPrefix VARCHAR(10) DEFAULT 'o!',
    modLogId VARCHAR(100),
    subReddit VARCHAR(100) DEFAULT 'meme',
    guildWelcome VARCHAR(100),
    guildWelcomeMsg VARCHAR(200),
    guildVolume INT(3) DEFAULT 100,
    guildLanguage VARCHAR(10) DEFAULT 'en_EN'
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS audit (
    id bigint NOT NULL AUTO_INCREMENT,
    discord_id varchar(255) NOT NULL,
    action longtext NOT NULL,
    method varchar(255) NOT NULL,
    timestamp int NOT NULL,
    PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE `caged_users`  (
  id int NOT NULL AUTO_INCREMENT,
  discord_id varchar(255) NOT NULL,
  old_roles longtext NOT NULL,
  expires varchar(255) NOT NULL DEFAULT '0',
  caged_by_user varchar(255) NOT NULL,
  caged_by_id varchar(255) NOT NULL,
  created_at varchar(255) NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS `channel_stats`  (
  id bigint NOT NULL AUTO_INCREMENT,
  channel_id bigint NOT NULL,
  channel_name varchar(255) NOT NULL,
  month_day varchar(255) NOT NULL,
  total bigint NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS `commands`  (
  id bigint NOT NULL AUTO_INCREMENT,
  hash varchar(32) NOT NULL,
  name text NOT NULL,
  content longtext NOT NULL,
  usage bigint NOT NULL DEFAULT 0,
  created_by bigint NOT NULL,
  updated_by bigint NULL DEFAULT NULL,
  created_at int NULL DEFAULT NULL,
  updated_at int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS `users`  (
  id bigint NOT NULL AUTO_INCREMENT,
  username text NOT NULL,
  discord_id bigint NOT NULL,
  is_admin tinyint NULL DEFAULT 0,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS `warnings`  (
  warn_id varchar(12) NOT NULL,
  warn_user_id varchar(255) NOT NULL,
  warn_user varchar(255) NOT NULL,
  warn_by_user varchar(255) NOT NULL,
  warn_by_id varchar(255) NOT NULL,
  warn_reason longtext NULL,
  created_at int NOT NULL,
  updated_at int NULL DEFAULT NULL,
  PRIMARY KEY (`warn_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS `bans`  (
  ban_id bigint NOT NULL AUTO_INCREMENT,
  discord_id bigint NOT NULL,
  username varchar(255) NOT NULL,
  reason text NOT NULL,
  method varchar(255) NOT NULL,
  banned_by_id varchar(255) NOT NULL,
  banned_by_user varchar(255) NOT NULL,
  created_at varchar(255) NOT NULL,
  PRIMARY KEY (`ban_id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

CREATE TABLE IF NOT EXISTS `afk_users`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `guild_id` bigint NOT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestamp` bigint NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `afk_id`(`id` ASC, `user_id` ASC, `guild_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;