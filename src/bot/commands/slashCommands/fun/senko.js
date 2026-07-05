const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'senko',
  category: 'sfw',
  apiType: 'senko/senko',
  description: "senko",
  action: (u, t) => `${u} senkos ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
