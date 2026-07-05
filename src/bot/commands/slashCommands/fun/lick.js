const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'lick',
  category: 'sfw',
  apiType: 'lick',
  description: "lick",
  action: (u, t) => `${u} licks ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
