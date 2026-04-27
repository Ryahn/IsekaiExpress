const express = require('express');
const { getDiscordAvatarUrl } = require('../../../libs/utils');
const { modCommandGroups, inDiscordPermissionNote } = require('../../../libs/modCommandHelpData');
const config = require('../../../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('modHelp', {
    username: req.session.user.username,
    avatarUrl: getDiscordAvatarUrl(req.session.user.id, req.session.user.avatar),
    csrfToken: req.session.csrf,
    publicBaseUrl: config.url.replace(/\/$/, ''),
    modCommandGroups,
    inDiscordPermissionNote,
  });
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod];
