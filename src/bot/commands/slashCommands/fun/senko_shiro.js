const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'senko_shiro',
  category: 'sfw',
  apiType: 'senko/shiro',
  description: "senko shiro",
  action: (u, t) => `${u} shiros ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
