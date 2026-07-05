const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'yuri',
  category: 'nsfw',
  apiType: 'yuri',
  description: "yuri",
  action: (user, target) => `${user} shares yuri with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
