
CREATE TABLE IF NOT EXISTS `afk_users`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `guild_id` bigint NOT NULL,
  `message` text NOT NULL,
  `timestamp` bigint NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `afk_id`(`id` ASC, `user_id` ASC, `guild_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci; 

