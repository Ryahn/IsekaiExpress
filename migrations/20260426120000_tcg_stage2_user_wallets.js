/**
 * TCG feature removed. This file remains as a historical migration placeholder so knex migration
 * history stays valid — this migration is already recorded in production's knex_migrations and
 * must not vanish. Do not add TCG logic here. The original TCG/card schema is intentionally NOT
 * created on fresh installs (the feature is gone). See database/README.md.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async function up() {};
exports.down = async function down() {};
