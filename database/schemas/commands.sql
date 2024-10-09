
CREATE TABLE IF NOT EXISTS `commands`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `hash` varchar(32) NOT NULL,
  `name` text NOT NULL,
  `content` longtext NOT NULL,
  `usage` bigint NOT NULL DEFAULT 0,
  `created_by` bigint NOT NULL,
  `updated_by` bigint NULL DEFAULT NULL,
  `created_at` int NULL DEFAULT NULL,
  `updated_at` int NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;