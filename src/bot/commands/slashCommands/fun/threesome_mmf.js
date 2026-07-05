const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'threesome_mmf',
  category: 'nsfw',
  apiType: 'threesome_mmf',
  description: "threesome mmf",
  action: (user, target) => `${user} shares threesome mmf with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
