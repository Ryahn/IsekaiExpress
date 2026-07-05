const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'lay',
  category: 'sfw',
  apiType: 'lay',
  description: "lay down",
  action: (u, t) => `${u} lays with ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
