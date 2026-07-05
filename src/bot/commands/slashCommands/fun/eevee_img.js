const path = require('path');
const { createImgReactionCommand } = require('../../../utils/imgApi');

const cmd = createImgReactionCommand({
  name: 'eevee_img',
  category: 'sfw',
  apiType: 'eevee/img',
  description: "eevee image",
  action: (u, t) => `${u} shares an eevee image with ${t}`,
  targetOption: true,
});

module.exports = { ...cmd, category: path.basename(__dirname) };
