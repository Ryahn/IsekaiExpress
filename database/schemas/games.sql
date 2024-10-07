/*
 Navicat Premium Data Transfer

 Source Server         : local vm
 Source Server Type    : MySQL
 Source Server Version : 80039 (8.0.39-0ubuntu0.20.04.1)
 Source Host           : localhost:3306
 Source Schema         : rule7

 Target Server Type    : MySQL
 Target Server Version : 80039 (8.0.39-0ubuntu0.20.04.1)
 File Encoding         : 65001

 Date: 04/10/2024 10:49:22
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for games
-- ----------------------------
CREATE TABLE IF NOT EXISTS `games`  (
  `rule_id` int NOT NULL AUTO_INCREMENT,
  `uniqueId` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `author` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `game_name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `game_name_jap` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `game_name_romaji` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `ruling` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `isAuthorBanned` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` bigint NULL DEFAULT NULL,
  `updated_at` bigint NULL DEFAULT NULL,
  `created_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `updated_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  PRIMARY KEY (`rule_id`) USING BTREE,
  UNIQUE INDEX `uniqueId`(`uniqueId` ASC) USING BTREE,
  UNIQUE INDEX `game_name`(`game_name`(320) ASC) USING BTREE,
  UNIQUE INDEX `game_name_jap`(`game_name_jap`(320) ASC) USING BTREE,
  UNIQUE INDEX `game_name_romaji`(`game_name_romaji`(320) ASC) USING BTREE,
  INDEX `rule_id`(`rule_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

SET FOREIGN_KEY_CHECKS = 1;
