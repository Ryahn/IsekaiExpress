
CREATE TABLE IF NOT EXISTS `caged_users`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `discord_id` varchar(255) NOT NULL,
  `old_roles` longtext NOT NULL,
  `expires` varchar(255) NOT NULL DEFAULT '0',
  `caged_by_user` varchar(255) NOT NULL,
  `caged_by_id` varchar(255) NOT NULL,
  `created_at` varchar(255) NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

