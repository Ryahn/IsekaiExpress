const BaseCommand = require("../../../../utils/structures/BaseCommand");

module.exports = class Roll extends BaseCommand {
    constructor() {
        super('roll', 'fun', ['dice']);
    }

    async run(client, message) {
        const user = message.author;

        const options = [
            { weight: 3, value: "https://www.youtube.com/watch?v=oHg5SJYRHA0" },
            { weight: 95, value: `${user} just rolled a **${getRandomNumber(1, 20)}**` },
            { weight: 1, value: `${user} just rolled a **0**` },
            { weight: 1, value: `${user} just rolled a **21**` },
        ];

        function weightedRandom(opts) {
            const totalWeight = opts.reduce((acc, opt) => acc + opt.weight, 0);
            let randomNum = Math.random() * totalWeight;

            for (const opt of opts) {
                if (randomNum < opt.weight) {
                    return opt.value;
                }
                randomNum -= opt.weight;
            }
            return opts[opts.length - 1].value;
        }

        function getRandomNumber(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        await message.channel.send(weightedRandom(options));
    }
}
