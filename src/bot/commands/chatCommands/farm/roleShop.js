const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');

async function handleRoleList(message) {
	message.reply('Role shop is not available yet.');
// 	const guildId = message.guild.id;
// 	const roleShop = await farmManager.getRoleShopConfig(guildId);

// 	if (!roleShop) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Role Shop Not Available')
// 			.setDescription('The role shop is not enabled in this server.')
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	if (!roleShop.roles || roleShop.roles.length === 0) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff9900)
// 			.setTitle('Role Shop')
// 			.setDescription('No roles available for purchase.')
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	const prefix = await farmManager.getServerPrefix(guildId);
// 	const roleList = roleShop.roles.map((role, index) => {
// 		const roleObj = message.guild.roles.cache.get(role.roleId);
// 		const roleName = roleObj ? roleObj.name : role.name;
// 		return `**${index + 1}. ${roleName}**\nPrice: $${role.price.toLocaleString()}\n${role.description || 'No description'}`;
// 	}).join('\n\n');

// 	const embed = new EmbedBuilder()
// 		.setColor(0x00ff00)
// 		.setTitle('Role Shop')
// 		.setDescription(roleList)
// 		.setFooter({ text: `Use ${prefix}role buy <role name> to purchase` })
// 		.setTimestamp();

// 	await message.reply({ embeds: [embed] });
// }

// async function handleRoleBuy(message, args) {
// 	const guildId = message.guild.id;
// 	const userId = message.author.id;
// 	const prefix = await farmManager.getServerPrefix(guildId);
// 	const roleShop = await farmManager.getRoleShopConfig(guildId);

// 	if (!roleShop) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Role Shop Not Available')
// 			.setDescription('The role shop is not enabled in this server.')
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	if (args.length === 0) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Error')
// 			.setDescription(`Please specify a role name!\n\nExample: \`${prefix}role buy VIP\`\nUse \`${prefix}role list\` to see available roles.`)
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	const roleName = args.join(' ').toLowerCase();

// 	const roleConfig = roleShop.roles.find((r) => {
// 		const roleObj = message.guild.roles.cache.get(r.roleId);
// 		return roleObj && roleObj.name.toLowerCase() === roleName;
// 	});

// 	if (!roleConfig) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Role Not Found')
// 			.setDescription(`Role **${args.join(' ')}** not found in the shop.\n\nUse \`${prefix}role list\` to see available roles.`)
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	const role = message.guild.roles.cache.get(roleConfig.roleId);

// 	if (!role) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Error')
// 			.setDescription('Role not found in server. Please contact an administrator.')
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	const member = await message.guild.members.fetch(userId);
// 	if (member.roles.cache.has(role.id)) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff9900)
// 			.setTitle('Already Owned')
// 			.setDescription(`You already have the **${role.name}** role!`)
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	const userFarm = await farmManager.getUserFarm(userId, guildId);
// 	if (userFarm.money < roleConfig.price) {
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Insufficient Funds')
// 			.addFields(
// 				{ name: 'Price', value: `$${roleConfig.price.toLocaleString()}`, inline: true },
// 				{ name: 'You Have', value: `$${userFarm.money.toLocaleString()}`, inline: true },
// 				{ name: 'Short', value: `$${(roleConfig.price - userFarm.money).toLocaleString()}`, inline: true },
// 			)
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 		return;
// 	}

// 	try {
// 		await member.roles.add(role);

// 		await farmManager.updateUserFarm(userId, guildId, {
// 			money: userFarm.money - roleConfig.price,
// 		});

// 		const embed = new EmbedBuilder()
// 			.setColor(0x00ff00)
// 			.setTitle('Role Purchased!')
// 			.setDescription(`You have purchased the **${role.name}** role!`)
// 			.addFields(
// 				{ name: 'Cost', value: `$${roleConfig.price.toLocaleString()}`, inline: true },
// 				{ name: 'Remaining Balance', value: `$${(userFarm.money - roleConfig.price).toLocaleString()}`, inline: true },
// 			)
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 	}
// 	catch (err) {
// 		message.client.logger.error('Farm role purchase error:', err);
// 		const embed = new EmbedBuilder()
// 			.setColor(0xff0000)
// 			.setTitle('Error')
// 			.setDescription('Failed to add role. The bot may not have permission to manage roles.')
// 			.setTimestamp();
// 		await message.reply({ embeds: [embed] });
// 	}
}

// module.exports = { handleRoleList, handleRoleBuy };
module.exports = { handleRoleList };