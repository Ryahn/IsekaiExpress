
CREATE TABLE IF NOT EXISTS `user_xp`  (
  `user_id` varchar(21) NOT NULL,
  `xp` bigint NULL DEFAULT 0,
  `message_count` bigint NULL DEFAULT 0,
  PRIMARY KEY (`user_id`) USING BTREE,
  UNIQUE INDEX `user_xp_user_id`(`user_id` ASC) USING BTREE,
  INDEX `user_xp_xp`(`xp` ASC, `message_count` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

