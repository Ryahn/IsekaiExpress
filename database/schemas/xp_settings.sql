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

 Date: 04/10/2024 10:43:28
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for xp_settings
-- ----------------------------
CREATE TABLE IF NOT EXISTS `xp_settings`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `messages_per_xp` int NULL DEFAULT 3,
  `min_xp_per_gain` int NULL DEFAULT 1,
  `max_xp_per_gain` int NULL DEFAULT 3,
  `weekend_multiplier` float NULL DEFAULT 2,
  `weekend_days` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'sat,sun',
  `double_xp_enabled` tinyint(1) NULL DEFAULT 0,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_messages_per_xp`(`messages_per_xp` ASC) USING BTREE,
  INDEX `idx_xp_gain`(`min_xp_per_gain` ASC, `max_xp_per_gain` ASC) USING BTREE,
  INDEX `idx_weekend_multiplier`(`weekend_multiplier` ASC) USING BTREE,
  INDEX `idx_double_xp_enabled`(`double_xp_enabled` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of xp_settings
-- ----------------------------
INSERT INTO `xp_settings` VALUES (1, 3, 1, 3, 2, 'sat,sun', 0);

SET FOREIGN_KEY_CHECKS = 1;
