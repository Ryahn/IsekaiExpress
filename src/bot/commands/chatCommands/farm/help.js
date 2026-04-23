const {
	buildFarmHelpPages,
	attachFarmHelpPagination,
	buildFarmHelpPaginationRow,
} = require('../../../utils/farm/farmHelpPages');

async function handleFarmHelp(message) {
	const pages = await buildFarmHelpPages(message.guild.id);
	const row = pages.length > 1
		? [buildFarmHelpPaginationRow(0, pages.length)]
		: [];

	const response = await message.reply({
		embeds: [pages[0]],
		components: row,
	});

	attachFarmHelpPagination(response, message.author.id, pages);
}

module.exports = { handleFarmHelp };
