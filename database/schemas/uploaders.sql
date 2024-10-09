
CREATE TABLE IF NOT EXISTS `uploaders`  (
  `uploaders_id` bigint NOT NULL,
  `discord_id` bigint NOT NULL,
  `username` varchar(255) NOT NULL,
  `position` varchar(255) NOT NULL,
  `promotion_date` varchar(255) NOT NULL,
  `created_at` varchar(255) NOT NULL,
  `updated_at` varchar(255) NOT NULL,
  `created_by` varchar(255) NOT NULL,
  `updated_by` varchar(255) NOT NULL,
  PRIMARY KEY (`uploaders_id`) USING BTREE,
  UNIQUE INDEX `uploaders_discord`(`discord_id` ASC) USING BTREE,
  INDEX `uploaders_id`(`uploaders_id` ASC) USING BTREE,
  FULLTEXT INDEX `uploaders_search`(`username`, `position`)
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

