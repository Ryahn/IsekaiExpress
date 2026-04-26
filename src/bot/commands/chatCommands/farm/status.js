const { EmbedBuilder } = require('discord.js');
const { farmManager } = require('../../../utils/farm/farmManager');
const { formatTime } = require('../../../utils/farm/cropManager');

async function handleFarmStatus(message, args) {
	const guildId = message.guild.id;
	const prefix = await farmManager.getServerPrefix(guildId);

	let targetUser = message.author;
	let userId = message.author.id;

	if (args.length > 0) {
		if (message.mentions.users.size > 0) {
			targetUser = message.mentions.users.first();
			userId = targetUser.id;
		}
		else {
			const searchName = args.join(' ').toLowerCase();
			const guild = message.guild;

			try {
				const members = await guild.members.fetch();
				const foundMember = members.find((member) =>
					member.user.username.toLowerCase() === searchName
          || member.user.tag.toLowerCase() === searchName
          || member.displayName.toLowerCase() === searchName,
				);

				if (foundMember) {
					targetUser = foundMember.user;
					userId = targetUser.id;
				}
				else {
					const embed = new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('❌ User Not Found')
						.setDescription(`Cannot find user **${args.join(' ')}**!\n\n💡 Use: \`${prefix}status @user\` or \`${prefix}status username\``)
						.setTimestamp();
					await message.reply({ embeds: [embed] });
					return;
				}
			}
			catch {
				const embed = new EmbedBuilder()
					.setColor(0xff0000)
					.setTitle('❌ Error')
					.setDescription('An error occurred while searching for the user.')
					.setTimestamp();
				await message.reply({ embeds: [embed] });
				return;
			}
		}
	}

	const userFarm = await farmManager.getUserFarm(userId, guildId);
	const cropStatus = await farmManager.getCropStatus(userId, guildId);

	let inventoryDisplay = '';
	if (Object.keys(userFarm.inventory).length === 0 || Object.values(userFarm.inventory).every((v) => v === 0)) {
		inventoryDisplay = '*Empty*';
	}
	else {
		const items = [];
		for (const [cropName, amount] of Object.entries(userFarm.inventory)) {
			if (amount > 0) {
				items.push(`• ${cropName}: **${amount}**`);
			}
		}
		inventoryDisplay = items.join('\n') || '*Empty*';
	}

	let cropDisplay = '';
	if (!userFarm.currentCrop) {
		cropDisplay = '*No crops growing*';
	}
	else {
		const crop = userFarm.currentCrop;
		if (cropStatus.ready) {
			const penalty = farmManager.calculateYieldPenalty(cropStatus.overdue);
			const penaltyPercent = Math.round((1 - penalty) * 100);

			if (penaltyPercent > 0) {
				cropDisplay = `🌾 **${crop.displayName}** - ✅ Ready!\n⚠️ Overdue by ${formatTime(cropStatus.overdue)}\n📉 Yield loss: **${penaltyPercent}%**\n💡 Harvest now to prevent more loss!`;
			}
			else {
				cropDisplay = `🌾 **${crop.displayName}** - ✅ Ready! Harvest now!`;
			}
		}
		else {
			cropDisplay = `🌱 **${crop.displayName}** - Growing...\n⏳ Time remaining: **${formatTime(cropStatus.timeLeft)}**`;
		}
	}

	const embed = new EmbedBuilder()
		.setColor(0x00ff00)
		.setTitle(`🌾 ${targetUser.username}'s Farm`)
		.addFields(
			{
				name: '💰 Money',
				value: `**$${userFarm.money.toLocaleString()}**`,
				inline: true,
			},
			{
				name: '🌟 Farm XP',
				value: `**${userFarm.farmXp.toLocaleString()}**`,
				inline: true,
			},
			{
				name: '🏗️ Land Slots',
				value: `**${userFarm.landSlots}**/100`,
				inline: true,
			},
			{
				name: '🌾 Current Crops',
				value: cropDisplay,
				inline: false,
			},
			{
				name: '📦 Inventory',
				value: inventoryDisplay,
				inline: false,
			},
		)
		.setTimestamp();

	await message.reply({ embeds: [embed] });
}

module.exports = { handleFarmStatus };
