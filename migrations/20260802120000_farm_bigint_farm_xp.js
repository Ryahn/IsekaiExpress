/**
 * Farm XP columns: INT UNSIGNED is too small for heavy harvesters; align with money (BIGINT UNSIGNED).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (!hasProfiles) return;

	const hasFarmXp = await knex.schema.hasColumn('farm_profiles', 'farm_xp');
	if (hasFarmXp) {
		await knex.raw(
			'ALTER TABLE `farm_profiles` MODIFY `farm_xp` BIGINT UNSIGNED NOT NULL DEFAULT 0',
		);
	}

	const hasConverted = await knex.schema.hasColumn('farm_profiles', 'farm_xp_converted_today');
	if (hasConverted) {
		await knex.raw(
			'ALTER TABLE `farm_profiles` MODIFY `farm_xp_converted_today` BIGINT UNSIGNED NOT NULL DEFAULT 0',
		);
	}
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
	const hasProfiles = await knex.schema.hasTable('farm_profiles');
	if (!hasProfiles) return;

	const hasFarmXp = await knex.schema.hasColumn('farm_profiles', 'farm_xp');
	if (hasFarmXp) {
		await knex.raw(
			'ALTER TABLE `farm_profiles` MODIFY `farm_xp` INT UNSIGNED NOT NULL DEFAULT 0',
		);
	}

	const hasConverted = await knex.schema.hasColumn('farm_profiles', 'farm_xp_converted_today');
	if (hasConverted) {
		await knex.raw(
			'ALTER TABLE `farm_profiles` MODIFY `farm_xp_converted_today` INT UNSIGNED NOT NULL DEFAULT 0',
		);
	}
};
