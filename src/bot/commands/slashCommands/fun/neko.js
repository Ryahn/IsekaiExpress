const path = require('path');
const { createNekoCommand } = require('../../../utils/imgApi');

const cmd = createNekoCommand({
  name: 'neko',
  category: 'sfw',
  description: 'neko gif or image',
});

module.exports = { ...cmd, category: path.basename(__dirname) };
