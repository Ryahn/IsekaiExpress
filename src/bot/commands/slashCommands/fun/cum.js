const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'cum',
  category: 'nsfw',
  apiType: 'cum',
  description: "cum",
  action: (user, target) => `${user} shares cum with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
