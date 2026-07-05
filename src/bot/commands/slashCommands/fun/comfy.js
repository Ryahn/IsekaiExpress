const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'comfy',
  category: 'sfw',
  apiType: 'comfy',
  description: "get comfy",
  action: (u, t) => `${u} gets comfy with ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
