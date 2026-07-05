const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'solo_male',
  category: 'nsfw',
  apiType: 'solo_male',
  description: "solo male",
  action: (user, target) => `${user} shares solo male with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
