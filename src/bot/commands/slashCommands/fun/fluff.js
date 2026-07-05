const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'fluff',
  category: 'sfw',
  apiType: 'fluff',
  description: "fluff",
  action: (u, t) => `${u} fluffs ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
