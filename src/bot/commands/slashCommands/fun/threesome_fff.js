const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'threesome_fff',
  category: 'nsfw',
  apiType: 'threesome_fff',
  description: "threesome fff",
  action: (user, target) => `${user} shares threesome fff with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
