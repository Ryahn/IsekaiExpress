const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'blowjob',
  category: 'nsfw',
  apiType: 'blowjob',
  description: "blowjob",
  action: (user, target) => `${user} shares blowjob with ${target}`,
  targetOption: true,
  nsfw: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
