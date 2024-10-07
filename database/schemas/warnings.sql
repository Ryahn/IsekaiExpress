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

 Date: 04/10/2024 10:45:56
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for warnings
-- ----------------------------
CREATE TABLE IF NOT EXISTS `warnings`  (
  `warn_id` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `warn_user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `warn_user` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `warn_by_user` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `warn_by_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `warn_reason` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `created_at` int NOT NULL,
  `updated_at` int NULL DEFAULT NULL,
  PRIMARY KEY (`warn_id`) USING BTREE,
  INDEX `idx_warn_user_id`(`warn_user_id` ASC) USING BTREE,
  INDEX `idx_warn_by_id`(`warn_by_id` ASC) USING BTREE,
  INDEX `idx_warn_user`(`warn_user` ASC) USING BTREE,
  INDEX `idx_warn_by_user`(`warn_by_user` ASC) USING BTREE,
  UNIQUE INDEX `idx_warn_id`(`warn_id` ASC) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci ROW_FORMAT = DYNAMIC;

SET FOREIGN_KEY_CHECKS = 1;
