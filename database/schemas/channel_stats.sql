
CREATE TABLE IF NOT EXISTS `channel_stats`  (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `channel_id` bigint NOT NULL,
  `channel_name` varchar(255) NOT NULL,
  `month_day` varchar(255) NOT NULL,
  `total` bigint NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

