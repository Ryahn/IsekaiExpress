// Crop definitions for farming minigame
// Sell price: $1 to $10 per unit (dynamic, changes every 6 hours)
// Buy price: Sell price + $1 to $3 per unit (dynamic, changes every 6 hours)
const crops = {
	tomato: {
		name: 'Tomato',
		displayName: '🍅 Tomato',
		yield: 75,
		growthTime: 4 * 60 * 60 * 1000,
	},
	carrot: {
		name: 'Carrot',
		displayName: '🥕 Carrot',
		yield: 108,
		growthTime: 6 * 60 * 60 * 1000,
	},
	pineapple: {
		name: 'Pineapple',
		displayName: '🍍 Pineapple',
		yield: 165,
		growthTime: 10 * 60 * 60 * 1000,
	},
	watermelon: {
		name: 'Watermelon',
		displayName: '🍉 Watermelon',
		yield: 138,
		growthTime: 8 * 60 * 60 * 1000,
	},
	grape: {
		name: 'Grape',
		displayName: '🍇 Grape',
		yield: 240,
		growthTime: 16 * 60 * 60 * 1000,
	},
	rose: {
		name: 'Rose',
		displayName: '🌹 Rose',
		yield: 45,
		growthTime: 2 * 60 * 60 * 1000,
	},
	wheat: {
		name: 'Wheat',
		displayName: '🌾 Wheat',
		yield: 720,
		growthTime: 48 * 60 * 60 * 1000,
	},
	mango: {
		name: 'Mango',
		displayName: '🥭 Mango',
		yield: 360,
		growthTime: 24 * 60 * 60 * 1000,
	},
	dragonfruit: {
		name: 'Dragonfruit',
		displayName: '🐉 Dragonfruit',
		yield: 189,
		growthTime: 12 * 60 * 60 * 1000,
	},
	sunflower: {
		name: 'Sunflower',
		displayName: '🌻 Sunflower',
		yield: 189,
		growthTime: 12 * 60 * 60 * 1000,
	},
	tulip: {
		name: 'Tulip',
		displayName: '🌷 Tulip',
		yield: 108,
		growthTime: 6 * 60 * 60 * 1000,
	},
	corn: {
		name: 'Corn',
		displayName: '🌽 Corn',
		yield: 360,
		growthTime: 24 * 60 * 60 * 1000,
	},
	cucumber: {
		name: 'Cucumber',
		displayName: '🥒 Cucumber',
		yield: 720,
		growthTime: 48 * 60 * 60 * 1000,
	},
	eggplant: {
		name: 'Eggplant',
		displayName: '🍆 Eggplant',
		yield: 138,
		growthTime: 8 * 60 * 60 * 1000,
	},
	lychee: {
		name: 'Lychee',
		displayName: '🍒 Lychee',
		yield: 1500,
		growthTime: 72 * 60 * 60 * 1000,
	},
	banana: {
		name: 'Banana',
		displayName: '🍌 Banana',
		yield: 180,
		growthTime: 11 * 60 * 60 * 1000,
	},
	strawberry: {
		name: 'Strawberry',
		displayName: '🍓 Strawberry',
		yield: 97,
		growthTime: 5 * 60 * 60 * 1000,
	},
	garlic: {
		name: 'Garlic',
		displayName: '🧄 Garlic',
		yield: 75,
		growthTime: 4 * 60 * 60 * 1000,
	},
	pumpkin: {
		name: 'Pumpkin',
		displayName: '🎃 Pumpkin',
		yield: 80,
		growthTime: 2 * 60 * 60 * 1000,
	},
	potato: {
		name: 'Potato',
		displayName: '🥔 Potato',
		yield: 108,
		growthTime: 6 * 60 * 60 * 1000,
	},
	chili: {
		name: 'Chili',
		displayName: '🌶️ Chili',
		yield: 45,
		growthTime: 1 * 60 * 60 * 1000,
	},
	catnip: {
		name: 'Lerd0 Catnip',
		displayName: '🌿 Lerd0 Catnip',
		yield: 189,
		growthTime: 12 * 60 * 60 * 1000,
	},
	birbfries: {
		name: 'birb fries',
		displayName: '🍟 birb fries',
		yield: 270,
		growthTime: 18 * 60 * 60 * 1000,
	},
	n7art: {
		name: 'N7 2B Art',
		displayName: '🎨 N7 2B Art',
		yield: 300,
		growthTime: 20 * 60 * 60 * 1000,
	},
	samai: {
		name: 'Sam AI Training',
		displayName: '🤖 Sam AI Training',
		yield: 1700,
		growthTime: 80 * 60 * 60 * 1000,
	},
};

module.exports = { crops };
