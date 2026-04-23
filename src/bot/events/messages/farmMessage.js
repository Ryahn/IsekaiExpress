const BaseEvent = require('../../utils/structures/BaseEvent');
const { farmManager } = require('../../utils/farm/farmManager');
const { handleFarmHelp } = require('../../commands/chatCommands/farm/help');
const { handleFarmLogin } = require('../../commands/chatCommands/farm/login');
const { handleFarmStatus } = require('../../commands/chatCommands/farm/status');
const { handleFarmGrow } = require('../../commands/chatCommands/farm/grow');
const { handleFarmHarvest } = require('../../commands/chatCommands/farm/harvest');
const { handleFarmInfo } = require('../../commands/chatCommands/farm/info');
const { handleFarmSell } = require('../../commands/chatCommands/farm/sell');
const { handleFarmExpand } = require('../../commands/chatCommands/farm/expand');
const { handleCropList } = require('../../commands/chatCommands/farm/cropList');
const { handleFarmBuy } = require('../../commands/chatCommands/farm/buy');
const { handleRoleList, handleRoleBuy } = require('../../commands/chatCommands/farm/roleShop');

/**
 * Prefix-based farm minigame (separate from guild cmdPrefix).
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if this message was handled as a farm command
 */
async function handleFarmMessage(message) {
	if (message.author.bot || !message.guild) return false;

	const userId = message.author.id;
	const guildId = message.guild.id;

	if (!(await farmManager.isGuildMinigameEnabled(guildId))) {
		return false;
	}

	if (!(await farmManager.isFarmingEnabled(userId, guildId))) {
		return false;
	}

	const prefix = await farmManager.getServerPrefix(guildId);
	const content = message.content.trim();

	if (!content.toLowerCase().startsWith(prefix.toLowerCase())) {
		return false;
	}

	const args = content.slice(prefix.length).trim().split(/\s+/);
	const command = args.shift()?.toLowerCase();

	if (!command) return false;

	try {
		switch (command) {
		case 'help':
		case 'h':
			await handleFarmHelp(message);
			return true;

		case 'login':
		case 'daily':
			await handleFarmLogin(message);
			return true;

		case 'status':
		case 'stats':
		case 'farm':
			await handleFarmStatus(message, args);
			return true;

		case 'grow':
		case 'plant':
			await handleFarmGrow(message, args);
			return true;

		case 'harvest':
		case 'reap':
			await handleFarmHarvest(message);
			return true;

		case 'crop':
			if (!args.length || args[0]?.toLowerCase() === 'list') {
				await handleCropList(message, args[0]?.toLowerCase() === 'list' ? args.slice(1) : args);
			}
			else {
				await handleFarmInfo(message, args);
			}
			return true;

		case 'sell':
			await handleFarmSell(message, args);
			return true;

		case 'buy':
		case 'purchase':
			await handleFarmBuy(message, args);
			return true;

		case 'expand':
			await handleFarmExpand(message);
			return true;

		case 'role':
			if (args[0]?.toLowerCase() === 'list') {
				await handleRoleList(message);
			}
			else if (args[0]?.toLowerCase() === 'buy') {
				await handleRoleBuy(message, args.slice(1));
			}
			else {
				await handleRoleList(message);
			}
			return true;

		case 'info':
			await handleFarmInfo(message, args);
			return true;

		default:
			return false;
		}
	}
	catch (err) {
		message.client.logger.error('Farm command error:', err);
		await message.reply('❌ An error occurred while processing your command.').catch(() => undefined);
		return true;
	}
}

module.exports = class FarmMessageEvent extends BaseEvent {
	constructor() {
		super('messageCreate');
	}

	async run(client, message) {
		await handleFarmMessage(message);
	}
};
