// Zero-dependency tests for the pure XP math. Run with: npm test  (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateLevel, calculateXPForNextLevel } = require('../libs/utils');

test('calculateLevel is monotonic non-decreasing in xp', () => {
  let prev = -1;
  for (let xp = 0; xp <= 1_000_000; xp += 5000) {
    const lvl = calculateLevel(xp);
    assert.ok(lvl >= prev, `level decreased at xp=${xp}`);
    prev = lvl;
  }
});

test('calculateLevel(0) is 0', () => {
  assert.equal(calculateLevel(0), 0);
});

test('calculateXPForNextLevel is the inverse of calculateLevel at the boundary', () => {
  // The XP required to reach (level+1) must itself compute to at least (level+1).
  for (let level = 0; level < 200; level++) {
    const need = calculateXPForNextLevel(level);
    assert.ok(
      calculateLevel(need) >= level + 1,
      `xp ${need} for next level should reach level ${level + 1}, got ${calculateLevel(need)}`,
    );
  }
});

test('one XP below the threshold does not yet reach the next level', () => {
  for (let level = 1; level < 200; level++) {
    const need = calculateXPForNextLevel(level);
    assert.ok(
      calculateLevel(need - 1) <= level,
      `xp ${need - 1} should not yet be level ${level + 1}`,
    );
  }
});
