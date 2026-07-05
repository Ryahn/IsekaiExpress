const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'threesome_ffm',
  category: 'nsfw',
  apiType: 'threesome_ffm',
  description: "threesome ffm",
  action: (user, target) => `${user} shares threesome ffm with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
