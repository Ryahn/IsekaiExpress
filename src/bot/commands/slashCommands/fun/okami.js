const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'okami',
  category: 'sfw',
  apiType: 'okami',
  description: "okami",
  action: (u, t) => `${u} okamis ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
