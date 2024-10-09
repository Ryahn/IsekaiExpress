
CREATE TABLE IF NOT EXISTS `GuildConfigurable`  (
  `guildId` varchar(100) NOT NULL,
  `cmdPrefix` varchar(10) NULL DEFAULT 'o!',
  `modLogId` varchar(100) NULL DEFAULT NULL,
  `subReddit` varchar(100) NULL DEFAULT 'meme',
  `guildWelcome` varchar(100) NULL DEFAULT NULL,
  `guildWelcomeMsg` varchar(200) NULL DEFAULT NULL,
  `guildVolume` int NULL DEFAULT 100,
  `guildLanguage` varchar(10) NULL DEFAULT 'en_EN',
  PRIMARY KEY (`guildId`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT INTO `GuildConfigurable` (guildId, cmdPrefix, modLogId, subReddit, guildWelcome, guildWelcomeMsg, guildVolume, guildLanguage) VALUES ('309355248575578113', '!', NULL, 'meme', NULL, NULL, 100, 'en_EN');

