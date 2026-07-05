const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'eevee_gif',
  category: 'sfw',
  apiType: 'eevee/gif',
  description: "eevee gif",
  action: (u, t) => `${u} shares an eevee gif with ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
