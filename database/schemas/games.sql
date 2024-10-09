
CREATE TABLE IF NOT EXISTS `games`  (
  `rule_id` int NOT NULL AUTO_INCREMENT,
  `uniqueId` char(64) NULL DEFAULT NULL,
  `author` text NULL,
  `game_name` text NULL,
  `game_name_jap` text NULL,
  `game_name_romaji` text NULL,
  `reason` text NULL,
  `ruling` varchar(255) NULL DEFAULT NULL,
  `isAuthorBanned` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` bigint NULL DEFAULT NULL,
  `updated_at` bigint NULL DEFAULT NULL,
  `created_by` varchar(255) NULL DEFAULT NULL,
  `updated_by` varchar(255) NULL DEFAULT NULL,
  PRIMARY KEY (`rule_id`) USING BTREE,
  UNIQUE INDEX `uniqueId`(`uniqueId` ASC) USING BTREE,
  UNIQUE INDEX `game_name`(`game_name`(320) ASC) USING BTREE,
  UNIQUE INDEX `game_name_jap`(`game_name_jap`(320) ASC) USING BTREE,
  UNIQUE INDEX `game_name_romaji`(`game_name_romaji`(320) ASC) USING BTREE,
  INDEX `rule_id`(`rule_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

