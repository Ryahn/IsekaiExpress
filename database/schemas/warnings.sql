
CREATE TABLE IF NOT EXISTS `warnings`  (
  `warn_id` varchar(12) NOT NULL,
  `warn_user_id` varchar(255) NOT NULL,
  `warn_user` varchar(255) NOT NULL,
  `warn_by_user` varchar(255) NOT NULL,
  `warn_by_id` varchar(255) NOT NULL,
  `warn_reason` longtext NULL,
  `created_at` int NOT NULL,
  `updated_at` int NULL DEFAULT NULL,
  PRIMARY KEY (`warn_id`) USING BTREE,
  INDEX `idx_warn_user_id`(`warn_user_id` ASC) USING BTREE,
  INDEX `idx_warn_by_id`(`warn_by_id` ASC) USING BTREE,
  INDEX `idx_warn_user`(`warn_user` ASC) USING BTREE,
  INDEX `idx_warn_by_user`(`warn_by_user` ASC) USING BTREE,
  UNIQUE INDEX `idx_warn_id`(`warn_id` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

