const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'angry',
  category: 'sfw',
  apiType: 'angry',
  description: "express anger",
  action: (u, t) => `${u} is angry at ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
