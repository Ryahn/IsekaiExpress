const config = require('../config/.config');
const { query, end } = require('../database/db');

const self = module.exports = {
    getCard: (cardName, typee) => {
        return `${config.url}/cards/${typee}/${cardName}.png`;
    },

	getRarityChances: async () => {
		const rarityChances = await query('rarity').select('*');
		rarityChances.sort((a, b) => a.high_chance - b.high_chance);
		await end();
		return Array.isArray(rarityChances) ? rarityChances : [rarityChances];
	},

	selectRarity: async (level) => {
		let rareChance = Math.max(1, 100 - (level * 0.5));
		const rarityChances = await self.getRarityChances();
	
		if (rarityChances.length === 0) {
			return 'N';
		}
	
		const randomFactor = Math.random();
		const randomThreshold = 0.35;
	
		if (randomFactor < randomThreshold) {
			const higherRarityIndex = Math.floor(Math.random() * rarityChances.length);
			return rarityChances[higherRarityIndex].abbreviation;
		}
	
		for (const rarity of rarityChances) {
			if (rareChance >= rarity.low_chance && rareChance <= rarity.high_chance) {
				return rarity.abbreviation;
			}
		}
		return 'N';
	},


	giveCard: (cardName, tyapee, user) => {}
}