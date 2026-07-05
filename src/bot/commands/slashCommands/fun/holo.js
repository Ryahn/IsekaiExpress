const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'holo',
  category: 'sfw',
  apiType: 'holo',
  description: "holo",
  action: (u, t) => `${u} holos ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
