const express = require('express');
const router = express.Router();
const config = require('../../../config');
const { getSystemHealth } = require('../../../libs/systemHealth');
const { hasModOrStaffRole } = require('../utils/roleAccess');

router.get('/', async (req, res, next) => {
	try {
		if (!hasModOrStaffRole(req.session)) {
			return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
		}

		const health = await getSystemHealth();
		return res.json({ health });
	} catch (error) {
		next(error);
	}
});

module.exports = router;
module.exports.requiredRoles = [config.roles.staff, config.roles.mod];
