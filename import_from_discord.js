const { Client, Intents } = require('discord.js');
const config = require('./config/.config');
const db = require('./database/db');
const logger = require('silly-logger');
const path = require('path');
const fs = require('fs');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_PRESENCES,
  ]
});

client.once('ready', async () => {
  logger.startup('Bot has started!');

  // try {
    const mtgClasses = [
      "Artificer", "Barbarian", "Bard", "Cleric",
      "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer",
      "Warlock", "Wizard", "Shaman", "Assassin", "Knight", "Warrior", "Berserker",
      "Elementalist", "Necromancer", "Soldier", "Archer", "Demon", "Angel",
      "Vampire", "Zombie", "Samurai", "Ninja", "Pirate", "Cleric", "Druid"
  ];
  
  function getRandomClass() {
      const randomIndex = Math.floor(Math.random() * mtgClasses.length);
      return mtgClasses[randomIndex];
  }
  
  function getRandomLevel() {
      return Math.floor(Math.random() * 10) + 1;
  }
  
  function getRandomPower() {
      return Math.floor(Math.random() * (11000 - 3000 + 1)) + 3000;
  }

  function getAvatar(avatar, user_id) {
    const avatarUrl = avatar 
            ? `https://cdn.discordapp.com/avatars/${user_id}/${avatar}.png?size=1024` 
            : 'https://cdn.discordapp.com/embed/avatars/0.png';
    return avatarUrl;
  }
    
    const guild = await client.guilds.fetch(config.discord.guildId);

    const getRoleMembers = async (roleId) => {
      const role = await guild.roles.fetch(roleId);
      if (!role) return [];
      return role.members.map(m => ({
        username:  m.displayName,
        discord_id: m.user.id,
        avatar: m.user.avatar,
        user_id: m.user.id
      }));
    };

    const [uploaders, mods, staff, retired] = await Promise.all([
      getRoleMembers(config.roles.uploader),
      getRoleMembers(config.roles.mod),
      getRoleMembers(config.roles.staff),
      getRoleMembers('755429913254821969')
    ]);

    const uploader_data = path.join(__dirname, './src/bot/tcg/uploader_data.json');
    const mods_data = path.join(__dirname, './src/bot/tcg/mods_data.json');
    const staff_data = path.join(__dirname, './src/bot/tcg/staff_data.json');
    const retired_data = path.join(__dirname, './src/bot/tcg/retired_data.json');

    const filteredUploaders = uploaders.filter(uploaderMember => {
      const hasModRole = mods.some(modMember => modMember.discord_id === uploaderMember.discord_id);
      const hasStaffRole = staff.some(staffMember => staffMember.discord_id === uploaderMember.discord_id);        
      return !hasModRole && !hasStaffRole;
    });

    const filteredMods =  mods.filter(modMember => {
      const hasStaffRole = staff.some(staffMember => staffMember.discord_id === modMember.discord_id);
      return !hasStaffRole;
    });

    let UploaderJson = []
    let ModsJson = []
    let StaffJson = []
    let RetiredJson = []

    for (const uploader of filteredUploaders) {
      UploaderJson.push({
        name: uploader.username,
        discord_id: uploader.discord_id,
        type: "hero",
        class: getRandomClass(),
        level: getRandomLevel(),
        power: getRandomPower(),
        avatar: getAvatar(uploader.avatar, uploader.user_id),
        rarity: {
            UR: 0,
            SUR: 0,
            SSR: 0,
            SR: 1,
            L: 1,
            M: 1,
            U: 1,
            R: 1,
            UC: 1,
            C: 0,
            N: 0
        }
      });
    }

    for (const mod of filteredMods) {
      ModsJson.push({
        name: mod.username,
        discord_id: mod.discord_id,
        type: "hero",
        class: getRandomClass(),
        level: getRandomLevel(),
        power: getRandomPower(),
        avatar: getAvatar(mod.avatar, mod.user_id),
        rarity: {
            UR: 0,
            SUR: 0,
            SSR: 1,
            SR: 1,
            L: 1,
            M: 1,
            U: 1,
            R: 1,
            UC: 1,
            C: 1,
            N: 1
        }
      });
    }

    for (const staffMember of staff) {
      StaffJson.push({
        name: staffMember.username,
        discord_id: staffMember.discord_id,
        type: "hero",
        class: getRandomClass(),
        level: getRandomLevel(),
        power: getRandomPower(),
        avatar: getAvatar(staffMember.avatar, staffMember.user_id),
        rarity: {
            UR: 1,
            SUR: 1,
            SSR: 1,
            SR: 1,
            L: 1,
            M: 1,
            U: 1,
            R: 1,
            UC: 0,
            C: 0,
            N: 0
        }
      });
    }

    for (const retiredMember of retired) {
      RetiredJson.push({
        name: retiredMember.username,
        discord_id: retiredMember.discord_id,
        type: "hero",
        class: getRandomClass(),
        level: getRandomLevel(),
        power: getRandomPower(),
        avatar: getAvatar(retiredMember.avatar, retiredMember.user_id),
        rarity: {
            UR: 1,
            SUR: 1,
            SSR: 1,
            SR: 1,
            L: 1,
            M: 1,
            U: 1,
            R: 1,
            UC: 1,
            C: 1,
            N: 1
        }
      });
    }

    fs.writeFileSync(uploader_data, JSON.stringify(UploaderJson, null, 2));
    fs.writeFileSync(mods_data, JSON.stringify(ModsJson, null, 2));
    fs.writeFileSync(staff_data, JSON.stringify(StaffJson, null, 2));
    fs.writeFileSync(retired_data, JSON.stringify(RetiredJson, null, 2));

  // } catch (error) {
  //   logger.error('Error fetching guild or roles:', error);
  // }
});

(async () => {
  logger.startup('Bot is starting...');
  await client.login(config.discord.botToken);
})();
