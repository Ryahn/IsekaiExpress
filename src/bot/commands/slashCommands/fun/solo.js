const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'solo',
  category: 'nsfw',
  apiType: 'solo',
  description: "solo",
  action: (user, target) => `${user} shares solo with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
