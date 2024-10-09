
CREATE TABLE IF NOT EXISTS `Guilds`  (
  `guildId` varchar(100) NOT NULL,
  `guildOwnerId` varchar(100) NOT NULL,
  PRIMARY KEY (`guildId`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT INTO `Guilds` (guildId, guildOwnerId) VALUES ('1277279882837229688', '133377139620708354');

