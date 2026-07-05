const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'anal',
  category: 'nsfw',
  apiType: 'anal',
  description: "anal",
  action: (user, target) => `${user} shares anal with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
