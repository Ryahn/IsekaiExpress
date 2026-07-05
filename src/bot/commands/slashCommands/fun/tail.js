const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'tail',
  category: 'sfw',
  apiType: 'tail',
  description: "tail wag",
  action: (u, t) => `${u} wags their tail at ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
