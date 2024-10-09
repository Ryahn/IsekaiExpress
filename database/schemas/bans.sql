
CREATE TABLE IF NOT EXISTS `bans`  (
  ban_id bigint NOT NULL AUTO_INCREMENT,
  discord_id bigint NOT NULL,
  username varchar(255) NOT NULL,
  reason text NOT NULL,
  method varchar(255) NOT NULL,
  banned_by_id varchar(255) NOT NULL,
  banned_by_user varchar(255) NOT NULL,
  created_at varchar(255) NOT NULL,
  PRIMARY KEY (`ban_id`) USING BTREE,
  UNIQUE INDEX `idx_discord_id`(`discord_id` ASC) USING BTREE,
  INDEX `idx_username`(`username` ASC) USING BTREE,
  INDEX `idx_banned_by_id`(`banned_by_id` ASC) USING BTREE,
  INDEX `idx_banned_by_user`(`banned_by_user` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

