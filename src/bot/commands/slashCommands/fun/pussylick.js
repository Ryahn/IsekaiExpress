const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'pussylick',
  category: 'nsfw',
  apiType: 'pussylick',
  description: "pussylick",
  action: (user, target) => `${user} shares pussylick with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
