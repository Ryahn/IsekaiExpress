const knex = require('../../../../database/db').query;
const { getDailyBuyPrice, getDailySellPrice, getAllCropNames } = require('./cropManager');

class PriceHistoryManager {
	getCurrentPeriodKey() {
		const now = new Date();
		const utc7Date = new Date(now.getTime() + (7 * 60 * 60 * 1000));
		const dateString = utc7Date.toISOString().split('T')[0];
		const hours = utc7Date.getUTCHours();
		const period = Math.floor(hours / 6) * 6;
		return `${dateString}-${String(period).padStart(2, '0')}`;
	}

	async _getLastUpdatePeriod() {
		const row = await knex('farm_price_meta').where({ id: 1 }).first();
		return row?.last_period_key || null;
	}

	async _setLastUpdatePeriod(periodKey) {
		await knex('farm_price_meta').where({ id: 1 }).update({ last_period_key: periodKey });
	}

	async updatePriceHistory() {
		const periodKey = this.getCurrentPeriodKey();
		const last = await this._getLastUpdatePeriod();
		if (last === periodKey) return;

		const exists = await knex('farm_price_points').where({ period_key: periodKey }).first();
		if (exists) {
			await this._setLastUpdatePeriod(periodKey);
			return;
		}

		const allCrops = getAllCropNames();
		const rows = allCrops.map((cropName) => ({
			period_key: periodKey,
			crop_name: cropName,
			buy_price: getDailyBuyPrice(cropName),
			sell_price: getDailySellPrice(cropName),
		}));

		try {
			await knex.transaction(async (trx) => {
				await trx('farm_price_points').insert(rows);
				for (const cropName of allCrops) {
					const keepKeys = await trx('farm_price_points')
						.select('period_key')
						.where({ crop_name: cropName })
						.orderBy('period_key', 'desc')
						.limit(20);
					const keySet = keepKeys.map((k) => k.period_key);
					if (keySet.length === 0) continue;
					await trx('farm_price_points')
						.where({ crop_name: cropName })
						.whereNotIn('period_key', keySet)
						.delete();
				}
				await trx('farm_price_meta').where({ id: 1 }).update({ last_period_key: periodKey });
			});
		}
		catch (err) {
			if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
				await this._setLastUpdatePeriod(periodKey);
				return;
			}
			throw err;
		}
	}

	async getCropPriceHistory(cropName) {
		await this.updatePriceHistory();
		const rows = await knex('farm_price_points')
			.where({ crop_name: cropName })
			.orderBy('period_key', 'asc');

		return rows.map((r) => ({
			timestamp: r.period_key,
			buy: Number(r.buy_price),
			sell: Number(r.sell_price),
		}));
	}

	async generatePriceChart(cropName, displayName) {
		const priceHistory = await this.getCropPriceHistory(cropName);
		if (priceHistory.length === 0) {
			return null;
		}

		const labels = priceHistory.map((p) => {
			const parts = p.timestamp.split('-');
			const month = parts[1];
			const day = parts[2];
			const hour = parts[3];
			return `${month}/${day} ${hour}h`;
		});

		const buyPrices = priceHistory.map((p) => p.buy);
		const sellPrices = priceHistory.map((p) => p.sell);

		const chartConfig = {
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label: 'Buy',
						data: buyPrices,
						borderColor: 'rgb(255,99,132)',
						borderWidth: 2,
						pointRadius: 3,
						fill: false,
					},
					{
						label: 'Sell',
						data: sellPrices,
						borderColor: 'rgb(54,162,235)',
						borderWidth: 2,
						pointRadius: 3,
						fill: false,
					},
				],
			},
			options: {
				title: {
					display: true,
					text: `${displayName} - 5 Days`,
					fontColor: '#fff',
				},
				legend: {
					display: true,
					labels: { fontColor: '#fff' },
				},
				scales: {
					yAxes: [{
						ticks: {
							fontColor: '#fff',
							callback(value) {
								return '$' + value;
							},
						},
					}],
					xAxes: [{
						ticks: {
							fontColor: '#fff',
							maxRotation: 45,
							minRotation: 45,
						},
					}],
				},
			},
		};

		const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
		return `https://quickchart.io/chart?bkg=rgb(40,40,40)&c=${encodedConfig}&width=800&height=400`;
	}
}

const priceHistoryManager = new PriceHistoryManager();

module.exports = { priceHistoryManager, PriceHistoryManager };
