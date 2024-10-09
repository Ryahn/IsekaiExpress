
CREATE TABLE IF NOT EXISTS `audit`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(255) NOT NULL,
  `action` longtext NOT NULL,
  `method` varchar(255) NOT NULL,
  `timestamp` bigint NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

