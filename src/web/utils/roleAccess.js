const config = require('../../../config');

function getSessionRoles(session) {
	return Array.isArray(session?.roles) ? session.roles : [];
}

function hasStaffRole(session) {
	const staffRole = config.roles.staff;
	return Boolean(staffRole && getSessionRoles(session).includes(staffRole));
}

function hasModOrStaffRole(session) {
	const roles = getSessionRoles(session);
	return [config.roles.staff, config.roles.mod].some((roleId) => roleId && roles.includes(roleId));
}

module.exports = {
	getSessionRoles,
	hasStaffRole,
	hasModOrStaffRole,
};
