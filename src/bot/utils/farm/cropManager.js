const { crops } = require('./configs/crops');

function getCrop(name) {
	const normalizedName = name.toLowerCase().trim();
	return crops[normalizedName] || null;
}

function getAllCropNames() {
	return Object.keys(crops);
}

function calculateSlotPrice(currentSlots) {
	return 20000 + (currentSlots * 5000);
}

function formatTime(ms) {
	if (ms <= 0) return '0 Hour 0 Minute';

	const hours = Math.floor(ms / (60 * 60 * 1000));
	const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

	return `${hours} Hour ${minutes} Minute`;
}

function getDailySellPrice(cropName, date = new Date()) {
	const utc7Date = new Date(date.getTime() + (7 * 60 * 60 * 1000));
	const dateString = utc7Date.toISOString().split('T')[0];
	const hours = utc7Date.getUTCHours();

	const period = Math.floor(hours / 6);
	const periodString = `${dateString}-${period}`;

	const seed = hashString(cropName.toLowerCase() + periodString + 'sell');
	const random = seededRandom(seed);

	const price = 1 + (random * 9);

	return Math.round(price * 100) / 100;
}

function getDailyBuyPrice(cropName, date = new Date()) {
	const sellPrice = getDailySellPrice(cropName, date);

	const utc7Date = new Date(date.getTime() + (7 * 60 * 60 * 1000));
	const dateString = utc7Date.toISOString().split('T')[0];
	const hours = utc7Date.getUTCHours();

	const period = Math.floor(hours / 6);
	const periodString = `${dateString}-${period}`;

	const seed = hashString(cropName.toLowerCase() + periodString + 'buy');
	const random = seededRandom(seed);

	const markup = 1 + (random * 2);
	const price = sellPrice + markup;

	return Math.round(price * 100) / 100;
}

function hashString(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return Math.abs(hash);
}

function seededRandom(seed) {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

module.exports = {
	crops,
	getCrop,
	getAllCropNames,
	calculateSlotPrice,
	formatTime,
	getDailySellPrice,
	getDailyBuyPrice,
};
