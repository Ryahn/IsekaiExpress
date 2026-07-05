const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'kitsune',
  category: 'sfw',
  apiType: 'kitsune',
  description: "kitsune",
  action: (u, t) => `${u} kitsunes ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
