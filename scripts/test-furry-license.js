/**
 * Generate a license PNG for a Discord user (for tuning text positions).
 *
 * Usage:
 *   node scripts/test-furry-license.js <discord_user_id>
 *   node scripts/test-furry-license.js <discord_user_id> --template furry|loli
 *   node scripts/test-furry-license.js <discord_user_id> --grid
 *   node scripts/test-furry-license.js <discord_user_id> --out ./my-license.png
 *
 * Requires DISCORD_BOT_TOKEN in .env (same as the bot).
 * Edit positions in LICENSE_TEMPLATES / DEFAULT_POSITIONS in src/bot/utils/furryLicense.js, then re-run.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  DEFAULT_POSITIONS,
  LOLI_DEFAULT_POSITIONS,
  LICENSE_TEMPLATES,
  discordAvatarUrl,
  displayName,
  renderLicense,
  registerLicenseFont,
} = require('../src/bot/utils/furryLicense');

function usage() {
  console.log(`Usage: node scripts/test-furry-license.js <discord_user_id> [--template furry|loli] [--grid] [--out <path>]`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') usage();

  const userId = args[0];
  let drawGrid = false;
  let templateId = 'furry';
  let outPath = path.join(process.cwd(), `furry_license_${userId}.png`);

  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--grid') {
      drawGrid = true;
    } else if (args[i] === '--template') {
      templateId = args[i + 1] || usage();
      if (!LICENSE_TEMPLATES[templateId]) {
        console.error(`Unknown template: ${templateId}. Use furry or loli.`);
        usage();
      }
      i += 1;
    } else if (args[i] === '--out') {
      outPath = path.resolve(args[i + 1] || usage());
      i += 1;
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      usage();
    }
  }

  if (templateId === 'loli' && outPath.includes('furry_license_')) {
    outPath = path.join(process.cwd(), `lolilicense_${userId}.png`);
  }

  return { userId, drawGrid, outPath, templateId };
}

async function fetchDiscordUser(userId, token) {
  const { data } = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
    headers: { Authorization: `Bot ${token}` },
    timeout: 15000,
  });
  return data;
}

async function main() {
  const { userId, drawGrid, outPath, templateId } = parseArgs(process.argv);
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
  const positions = templateId === 'loli' ? LOLI_DEFAULT_POSITIONS : DEFAULT_POSITIONS;

  console.log('\nDiscord user:');
  console.log(`  id:           ${user.id}`);
  console.log(`  username:     ${user.username}`);
  console.log(`  global_name:  ${user.global_name ?? '(none)'}`);
  console.log(`  display name: ${displayName(user)}`);
  console.log(`  avatar url:   ${discordAvatarUrl(user)}`);
  console.log(`  bot:          ${user.bot ?? false}`);
  console.log(`\nTemplate:       ${templateId}`);
  console.log(`Canvas font:    ${font}`);
  console.log('\nText positions (edit in src/bot/utils/furryLicense.js):');
  console.log(JSON.stringify(positions, null, 2));

  console.log('\nRendering license...');
  const png = await renderLicense({ templateId, user, drawGrid });
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
