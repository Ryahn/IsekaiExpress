
CREATE TABLE IF NOT EXISTS `users`  (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NULL DEFAULT NULL,
  `discord_id` varchar(255) NULL DEFAULT NULL,
  `api_key` varchar(255) NULL DEFAULT NULL,
  `f95_id` bigint NULL DEFAULT NULL,
  `f95_username` varchar(255) NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `idx_discord_id`(`discord_id` ASC) USING BTREE,
  INDEX `idx_f95_id`(`f95_id` ASC) USING BTREE,
  INDEX `idx_f95_username`(`f95_username` ASC) USING BTREE,
  INDEX `idx_username`(`username` ASC) USING BTREE,
  INDEX `idx_api_key`(`api_key` ASC) USING BTREE,
  INDEX `idx_id`(`id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

