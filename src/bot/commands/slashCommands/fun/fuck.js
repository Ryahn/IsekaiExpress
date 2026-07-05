const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'fuck',
  category: 'nsfw',
  apiType: 'fuck',
  description: 'bang someone really hard',
  action: (user, target) => `${user} bangs the shit out of ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
