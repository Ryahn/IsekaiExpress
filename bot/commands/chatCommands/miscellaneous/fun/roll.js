const BaseCommand = require("../../../../utils/structures/BaseCommand");
const { MessageEmbed, Formatters } = require('discord.js');

// Cooldown map to store user cooldowns
const cooldowns = new Map();

module.exports = class Gaydar extends BaseCommand {
    constructor() {
        super('roll', 'fun', ['dice']);
    }

    async run(client, message) {
        const cooldownTime = 5 * 1000; // Cooldown time in milliseconds (e.g., 10 seconds)
        const user = message.author;

        // Check if the user is on cooldown
        if (cooldowns.has(user.id)) {
            const expirationTime = cooldowns.get(user.id) + cooldownTime;

            if (Date.now() < expirationTime) {
                const timeLeft = (expirationTime - Date.now()) / 1000;
                return message.reply(`You are on cooldown! Please wait ${timeLeft.toFixed(1)} more seconds.`);
            }
        }

        // Define the random outcomes with their respective weights
        const options = [
            { weight: 3, value: "https://www.youtube.com/watch?v=oHg5SJYRHA0" },
            { weight: 95, value: `${user} just rolled a **${getRandomNumber(1, 20)}**` },
            { weight: 1, value: `${user} just rolled a **0**` },
            { weight: 1, value: `${user} just rolled a **21**` }
        ];

        // Function to handle weighted random selection
        function weightedRandom(options) {
            const totalWeight = options.reduce((acc, opt) => acc + opt.weight, 0);
            let randomNum = Math.random() * totalWeight;
            
            for (let opt of options) {
                if (randomNum < opt.weight) {
                    return opt.value;
                }
                randomNum -= opt.weight;
            }
        }

        // Function to get a random number within a range
        function getRandomNumber(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // Get the result based on the weighted random function
        const result = weightedRandom(options);

        // Send the result to the channel
        message.channel.send(result);

        // Set the cooldown for the user
        cooldowns.set(user.id, Date.now());
    }
}
