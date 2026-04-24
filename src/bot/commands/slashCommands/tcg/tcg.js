const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const tcgEconomy = require('../../../../../libs/tcgEconomy');
const tcgInventory = require('../../../../../libs/tcgInventory');
const tcgLoadout = require('../../../../../libs/tcgLoadout');
const tcgSpar = require('../../../../../libs/tcgSpar');
const { DISPLAY_LABEL } = require('../../../tcg/elements');
const { statLevelMultiplier } = require('../../../tcg/cardLayout');

function formatDuration(sec) {
  const s = Math.ceil(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function isStaff(client, interaction) {
  const staffRole = client.config?.roles?.staff;
  if (!staffRole || !interaction.inGuild()) return false;
  return interaction.member?.roles?.cache?.has(staffRole) ?? false;
}

module.exports = {
  category: path.basename(__dirname),

  data: new SlashCommandBuilder()
    .setName('tcg')
    .setDescription('Card game — economy, collection, battles')
    .addSubcommand((sub) =>
      sub
        .setName('balance')
        .setDescription('View your TCG gold, XP, and inventory space'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('convert')
        .setDescription(`Convert XP to gold (${tcgEconomy.XP_PER_GOLD_UNIT} XP = 1g)`)
        .addIntegerOption((opt) =>
          opt
            .setName('xp')
            .setDescription(`XP to spend (multiple of ${tcgEconomy.XP_PER_GOLD_UNIT})`)
            .setRequired(true)
            .setMinValue(tcgEconomy.XP_PER_GOLD_UNIT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('daily')
        .setDescription(`Claim daily login XP (${tcgEconomy.DAILY_LOGIN_XP} XP / 24h)`),
    )
    .addSubcommand((sub) =>
      sub
        .setName('inventory')
        .setDescription('List your owned card copies')
        .addIntegerOption((o) =>
          o.setName('page').setDescription('Page number').setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Inspect one of your copies (instance)')
        .addIntegerOption((o) =>
          o.setName('instance').setDescription('Copy ID from /tcg inventory').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('breakdown')
        .setDescription('Destroy a copy for gold ([CardSystem.md] values)')
        .addIntegerOption((o) =>
          o.setName('instance').setDescription('Copy ID to break down').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('fuse')
        .setDescription('Combine two identical copies (same template & level) → +1 level')
        .addIntegerOption((o) =>
          o.setName('first').setDescription('First copy ID').setRequired(true).setMinValue(1),
        )
        .addIntegerOption((o) =>
          o.setName('second').setDescription('Second copy ID').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reroll')
        .setDescription('Pay gold to move this copy to a random other element (same character & rarity)')
        .addIntegerOption((o) =>
          o.setName('instance').setDescription('Copy ID to reroll').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('loadout').setDescription('View your main + 2 support slots'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Put a copy into your loadout')
        .addStringOption((o) =>
          o
            .setName('slot')
            .setDescription('Slot')
            .setRequired(true)
            .addChoices(
              { name: 'Main (fighter)', value: 'main' },
              { name: 'Support 1', value: 'support1' },
              { name: 'Support 2', value: 'support2' },
            ),
        )
        .addIntegerOption((o) =>
          o.setName('instance').setDescription('Copy ID from /tcg inventory').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unequip')
        .setDescription('Clear a loadout slot')
        .addStringOption((o) =>
          o
            .setName('slot')
            .setDescription('Slot')
            .setRequired(true)
            .addChoices(
              { name: 'Main', value: 'main' },
              { name: 'Support 1', value: 'support1' },
              { name: 'Support 2', value: 'support2' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('spar')
        .setDescription(
          `Practice fight: your **main** vs random catalog card (win **+${tcgSpar.SPAR_WIN_GOLD}**g, PvE XP rules)`,
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('grant')
        .setDescription('Staff: grant a catalog card to a user (by template UUID)')
        .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
        .addStringOption((o) =>
          o.setName('uuid').setDescription('Catalog card UUID').setRequired(true),
        ),
    ),

  async execute(client, interaction) {
    const discordUser = interaction.user;
    const sub = interaction.options.getSubcommand();

    if (sub === 'balance') {
      const bal = await tcgEconomy.getTcgBalance(client, discordUser);
      if (!bal) {
        return interaction.editReply({ content: 'Could not load your profile.', ephemeral: true });
      }
      const owned = await tcgInventory.countInventoryForDiscordUser(client, discordUser);
      const cap = tcgInventory.DEFAULT_INVENTORY_CAP;
      const dailyLine = bal.dailyReady
        ? 'Daily login: **ready** (`/tcg daily`)'
        : `Daily login: on cooldown (~${formatDuration(bal.dailyRemainingSec)} remaining)`;
      const embed = new EmbedBuilder()
        .setTitle('TCG profile')
        .addFields(
          { name: 'Gold', value: `${bal.gold.toLocaleString()}g`, inline: true },
          { name: 'XP', value: String(bal.xp), inline: true },
          { name: 'Level', value: String(bal.level), inline: true },
          { name: 'Collection', value: `${owned} / ${cap} cards`, inline: false },
          { name: 'Status', value: dailyLine, inline: false },
        )
        .setColor(0x5865f2);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'convert') {
      const xp = interaction.options.getInteger('xp', true);
      const result = await tcgEconomy.convertXpToGold(client, discordUser, xp);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({
        content: `Converted **${xp}** XP → **${result.goldGained}**g. You now have **${result.newGold.toLocaleString()}**g and **${result.newXp}** XP.`,
        ephemeral: true,
      });
    }

    if (sub === 'daily') {
      const result = await tcgEconomy.claimTcgDaily(client, discordUser);
      if (!result.ok) {
        if (result.error === 'cooldown') {
          return interaction.editReply({
            content: `Daily already claimed. Try again in **${formatDuration(result.remainingSec)}**.`,
            ephemeral: true,
          });
        }
        return interaction.editReply({ content: result.error || 'Could not claim daily.', ephemeral: true });
      }
      const bal = await tcgEconomy.getTcgBalance(client, discordUser);
      return interaction.editReply({
        content: `**+${result.xpGained}** daily login XP. You now have **${bal.xp}** XP.`,
        ephemeral: true,
      });
    }

    if (sub === 'inventory') {
      const page = interaction.options.getInteger('page') ?? 1;
      const { rows, total, page: p, totalPages } = await tcgInventory.fetchInventoryPage(
        client,
        discordUser,
        page,
        8,
      );
      if (!total) {
        return interaction.editReply({
          content: `No cards yet. Staff can use \`/tcg grant\`; packs drop logic comes in a later stage.`,
          ephemeral: true,
        });
      }
      const lines = rows.map((r) => {
        const el = r.element ? (DISPLAY_LABEL[r.element] || r.element) : '—';
        const ab = r.ability_key ? String(r.ability_key).replace(/_/g, ' ') : '—';
        return `**#${r.user_card_id}** · ${r.name} (${r.rarity}) · Lv${r.level} · ${el} · ${ab}`;
      });
      const embed = new EmbedBuilder()
        .setTitle(`Your collection — page ${p}/${totalPages}`)
        .setDescription(`${total} copies total\n\n${lines.join('\n')}`)
        .setFooter({ text: 'Use /tcg view instance:<id> for details' })
        .setColor(0x57f287);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'view') {
      const instanceId = interaction.options.getInteger('instance', true);
      const row = await tcgInventory.getInstanceDetailForOwner(client, discordUser, instanceId);
      if (!row) {
        return interaction.editReply({ content: 'Copy not found (wrong ID or not yours).', ephemeral: true });
      }
      const el = row.element ? (DISPLAY_LABEL[row.element] || row.element) : 'N/A';
      const ab = row.ability_key ? String(row.ability_key).replace(/_/g, ' ') : 'N/A';
      const mult = statLevelMultiplier(row.level);
      const power =
        row.base_power != null
          ? Math.round(Number(row.base_power) * mult)
          : 'N/A';
      const stats =
        row.base_atk != null
          ? `ATK ${Math.round(row.base_atk * mult)} · DEF ${Math.round(row.base_def * mult)} · SPD ${Math.round(row.base_spd * mult)} · HP ${Math.round(row.base_hp * mult)}`
          : 'N/A';
      const nextReroll = tcgInventory.nextElementRerollCost(row.element_reroll_count ?? 0);
      const embed = new EmbedBuilder()
        .setTitle(`${row.name} (#${row.user_card_id})`)
        .setDescription(row.description || '—')
        .addFields(
          { name: 'Rarity', value: row.rarity || '—', inline: true },
          { name: 'Element', value: el, inline: true },
          { name: 'Level', value: String(row.level), inline: true },
          { name: 'Ability', value: ab, inline: true },
          { name: 'Power (scaled)', value: String(power), inline: true },
          { name: 'Stats (scaled)', value: stats, inline: false },
          {
            name: 'Element reroll',
            value: `Next cost: **${nextReroll}**g (count: ${row.element_reroll_count ?? 0})`,
            inline: false,
          },
          { name: 'Catalog UUID', value: row.uuid || '—', inline: false },
        )
        .setImage(row.image_url || null)
        .setColor(0x5865f2);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'breakdown') {
      const instanceId = interaction.options.getInteger('instance', true);
      const result = await tcgInventory.breakdownInstance(client, discordUser, instanceId);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({
        content: `Breakdown **${result.templateName}**: **+${result.gold}**g (total **${result.newGold.toLocaleString()}**g).`,
        ephemeral: true,
      });
    }

    if (sub === 'fuse') {
      const first = interaction.options.getInteger('first', true);
      const second = interaction.options.getInteger('second', true);
      const result = await tcgInventory.fuseInstances(client, discordUser, first, second);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({
        content: `Fused into one **Lv${result.newLevel}** copy (**#${result.userCardId}**).`,
        ephemeral: true,
      });
    }

    if (sub === 'reroll') {
      const instanceId = interaction.options.getInteger('instance', true);
      const result = await tcgInventory.rerollElement(client, discordUser, instanceId);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({
        content: `Paid **${result.cost}**g → new element **${result.elementLabel}**. Remaining gold: **${result.newGold.toLocaleString()}**g.`,
        ephemeral: true,
      });
    }

    if (sub === 'loadout') {
      const detail = await tcgLoadout.getLoadoutDetail(client, discordUser);
      if (!detail) {
        return interaction.editReply({ content: 'Could not load loadout.', ephemeral: true });
      }
      const fmt = (c, label, rawId) => {
        if (rawId && !c) {
          return `**${label}:** stale slot (copy #${rawId} gone) — \`/tcg unequip\` then re-equip`;
        }
        if (!c) return `**${label}:** — empty —`;
        const el = c.element ? (DISPLAY_LABEL[c.element] || c.element) : '—';
        return `**${label}:** ${c.name} (#${c.user_card_id}) · ${c.rarity} · Lv${c.level} · ${el}`;
      };
      const embed = new EmbedBuilder()
        .setTitle('Loadout')
        .setDescription(
          `${fmt(detail.main, 'Main', detail.row.main_user_card_id)}\n`
            + `${fmt(detail.support1, 'Support 1', detail.row.support1_user_card_id)}\n`
            + `${fmt(detail.support2, 'Support 2', detail.row.support2_user_card_id)}\n\n`
            + '_Support bonuses and region effects are not applied in this build — main card only for `/tcg spar`._',
        )
        .setColor(0x9b59b6);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'equip') {
      const slot = interaction.options.getString('slot', true);
      const instanceId = interaction.options.getInteger('instance', true);
      const result = await tcgLoadout.setLoadoutSlot(client, discordUser, slot, instanceId);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({
        content: `Equipped copy **#${instanceId}** as **${slot}**.`,
        ephemeral: true,
      });
    }

    if (sub === 'unequip') {
      const slot = interaction.options.getString('slot', true);
      const result = await tcgLoadout.setLoadoutSlot(client, discordUser, slot, null);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({ content: `Cleared **${slot}**.`, ephemeral: true });
    }

    if (sub === 'spar') {
      const result = await tcgSpar.runSpar(client, discordUser);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      const { sim, goldGained, won, playerLabel, enemyLabel, playerLevel } = result;
      const title = won ? 'Spar — victory' : sim.outcome === 'draw' ? 'Spar — draw' : 'Spar — defeat';
      const logText = sim.log.slice(0, 14).join('\n') || '—';
      const goldLine = goldGained ? `**+${goldGained}**g` : '**0**g (win for gold)';
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `**${playerLabel}** (Lv${playerLevel} main) vs **${enemyLabel}** (scaled)\n`
            + `${sim.elementSummary}\n\n${logText}${sim.log.length > 14 ? '\n…' : ''}`,
        )
        .addFields(
          { name: 'Result', value: `${sim.outcome.toUpperCase()} · ${sim.rounds} steps`, inline: true },
          { name: 'Gold', value: goldLine, inline: true },
          { name: 'XP', value: 'Applied via PvE rules (`awardTcgBattleXp`)', inline: false },
        )
        .setColor(won ? 0x57f287 : 0xed4245);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'grant') {
      if (!isStaff(client, interaction)) {
        return interaction.editReply({ content: 'Only staff can use `/tcg grant`.', ephemeral: true });
      }
      const target = interaction.options.getUser('user', true);
      const uuid = interaction.options.getString('uuid', true);
      const result = await tcgInventory.grantCardToPlayer(client, target, { uuid });
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      return interaction.editReply({
        content: `Granted **${result.template.name}** (${result.template.rarity}, ${result.template.element || '—'}) to ${target} — copy **#${result.userCardId}**, ability **${result.ability_key}**.`,
        ephemeral: true,
      });
    }

    return interaction.editReply({ content: 'Unknown subcommand.', ephemeral: true });
  },
};
