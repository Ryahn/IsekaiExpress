/**
 * Add 'dismissed' as a valid status on pending_image_reviews.
 * Used by the new Dismiss button on the image-review queue UI to drop
 * duplicate / stale entries without applying any action to the user.
 *
 * @param { import("knex").Knex } knex
 */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE pending_image_reviews
    MODIFY COLUMN status ENUM('pending', 'approved', 'banned', 'dismissed') NOT NULL DEFAULT 'pending'
  `);
};

exports.down = async (knex) => {
  await knex('pending_image_reviews').where({ status: 'dismissed' }).update({ status: 'approved' });
  await knex.raw(`
    ALTER TABLE pending_image_reviews
    MODIFY COLUMN status ENUM('pending', 'approved', 'banned') NOT NULL DEFAULT 'pending'
  `);
};
