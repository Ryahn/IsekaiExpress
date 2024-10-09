
CREATE TABLE IF NOT EXISTS `dmca`  (
  `dmca_id` bigint NOT NULL AUTO_INCREMENT,
  `unique_id` char(64) NOT NULL,
  `game_name` text NOT NULL,
  `game_url` text NOT NULL,
  `dev_name` text NOT NULL,
  `severity` text NOT NULL,
  `created_at` bigint NULL DEFAULT NULL,
  `updated_at` bigint NULL DEFAULT NULL,
  `created_by` varchar(255) NULL DEFAULT NULL,
  `updated_by` varchar(255) NULL DEFAULT NULL,
  PRIMARY KEY (`dmca_id`) USING BTREE,
  INDEX `dmca_id`(`dmca_id` ASC) USING BTREE,
  FULLTEXT INDEX `dmca_uniqueid`(`unique_id`),
  FULLTEXT INDEX `dmca_game_name`(`game_name`),
  FULLTEXT INDEX `dmca_game_url`(`game_url`)
) ENGINE = InnoDB AUTO_INCREMENT = 116 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

