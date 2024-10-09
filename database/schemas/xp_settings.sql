CREATE TABLE IF NOT EXISTS `xp_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `messages_per_xp` int DEFAULT 3,
  `min_xp_per_gain` int DEFAULT 1,
  `max_xp_per_gain` int DEFAULT 3,
  `weekend_multiplier` float DEFAULT 2,
  `weekend_days` varchar(20) DEFAULT 'sat,sun',
  `double_xp_enabled` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `xp_settings` 
(messages_per_xp, min_xp_per_gain, max_xp_per_gain, weekend_multiplier, weekend_days, double_xp_enabled) 
VALUES 
(3, 1, 3, 2, 'sat,sun', 0);