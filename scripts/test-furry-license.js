/**
 * Generate a furry license PNG for a Discord user (for tuning text positions).
 *
 * Usage:
 *   node scripts/test-furry-license.js <discord_user_id>
 *   node scripts/test-furry-license.js <discord_user_id> --grid
 *   node scripts/test-furry-license.js <discord_user_id> --out ./my-license.png
 *
 * Requires DISCORD_BOT_TOKEN in .env (same as the bot).
 * Edit DEFAULT_POSITIONS in src/bot/utils/furryLicense.js, then re-run this script.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  DEFAULT_POSITIONS,
  discordAvatarUrl,
  displayName,
  renderFurryLicense,
  registerLicenseFont,
} = require('../src/bot/utils/furryLicense');

function usage() {
  console.log(`Usage: node scripts/test-furry-license.js <discord_user_id> [--grid] [--out <path>]`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') usage();

  const userId = args[0];
  let drawGrid = false;
  let outPath = path.join(process.cwd(), `furry_license_${userId}.png`);

  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--grid') {
      drawGrid = true;
    } else if (args[i] === '--out') {
      outPath = path.resolve(args[i + 1] || usage());
      i += 1;
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      usage();
    }
  }

  return { userId, drawGrid, outPath };
}

async function fetchDiscordUser(userId, token) {
  const { data } = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
    headers: { Authorization: `Bot ${token}` },
    timeout: 15000,
  });
  return data;
}

async function main() {
  const { userId, drawGrid, outPath } = parseArgs(process.argv);
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN in .env');
    process.exit(1);
  }

  if (!/^\d{17,20}$/.test(userId)) {
    console.error('Discord user IDs are 17–20 digit snowflakes.');
    process.exit(1);
  }

  console.log('Fetching user from Discord API...');
  const user = await fetchDiscordUser(userId, token);
  const font = registerLicenseFont();

  console.log('\nDiscord user:');
  console.log(`  id:           ${user.id}`);
  console.log(`  username:     ${user.username}`);
  console.log(`  global_name:  ${user.global_name ?? '(none)'}`);
  console.log(`  display name: ${displayName(user)}`);
  console.log(`  avatar url:   ${discordAvatarUrl(user)}`);
  console.log(`  bot:          ${user.bot ?? false}`);
  console.log(`\nCanvas font:    ${font}`);
  console.log('\nText positions (edit in src/bot/utils/furryLicense.js):');
  console.log(JSON.stringify(DEFAULT_POSITIONS, null, 2));

  console.log('\nRendering license...');
  const png = await renderFurryLicense({ user, drawGrid });
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${outPath}${drawGrid ? ' (with position grid)' : ''}`);
}

main().catch((err) => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.error(`Discord API error${status ? ` (${status})` : ''}:`, body || err.message);
    if (status === 401) console.error('Check DISCORD_BOT_TOKEN in .env');
    if (status === 404) console.error('User not found (wrong ID or user not visible to the bot)');
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
