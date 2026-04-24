const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const tcgEconomy = require('../../../../../libs/tcgEconomy');
const tcgInventory = require('../../../../../libs/tcgInventory');
const tcgLoadout = require('../../../../../libs/tcgLoadout');
const tcgSpar = require('../../../../../libs/tcgSpar');
const tcgPve = require('../../../../../libs/tcgPve');
const tcgSynergy = require('../../../../../libs/tcgSynergy');
const tcgPacks = require('../../../../../libs/tcgPacks');
const tcgDirectBuy = require('../../../../../libs/tcgDirectBuy');
const tcgShop = require('../../../../../libs/tcgShop');
const { battlesRequiredForTier } = require('../../../../../libs/tcgPveConfig');
const { DISPLAY_LABEL, ELEMENT_IDS } = require('../../../tcg/elements');
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

function formatTcgPullLines(pulls) {
  return pulls.map((p, i) => {
    const el = p.template.element ? DISPLAY_LABEL[p.template.element] || p.template.element : '—';
    return `**${i + 1}.** ${p.template.name} · ${p.template.rarity} · ${el} · copy **#${p.userCardId}**`;
  });
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
        .setName('synergy')
        .setDescription('Preview combat synergies (spar vs your current PvE region)')
        .addStringOption((o) => {
          o
            .setName('enemy_element')
            .setDescription('Optional: include Counter Build vs this element');
          o.addChoices({ name: '— (skip Counter Build)', value: 'none' });
          for (const k of ELEMENT_IDS) {
            o.addChoices({ name: DISPLAY_LABEL[k], value: k });
          }
          return o;
        }),
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
      sub.setName('pve_progress').setDescription('PvE region, tier, and progress toward tier clear'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pve_fight')
        .setDescription('Fight a PvE battle (main card; region rules, gold by tier, advances on win)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pve_travel')
        .setDescription('Move to an unlocked region/tier to revisit content (resets streak & tier wins)')
        .addIntegerOption((o) =>
          o.setName('region').setDescription('Region 1–6').setRequired(true).setMinValue(1).setMaxValue(6),
        )
        .addIntegerOption((o) =>
          o
            .setName('tier')
            .setDescription('Tier for that region (omit = first tier available in region)')
            .setMinValue(1)
            .setMaxValue(10),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy_pack')
        .setDescription(
          `Buy a card pack — Basic / Advanced / Premium / Boss (${tcgPacks.BOSS_PACK_COST}g) / Region (${tcgPacks.REGION_PACK_COST}g + region)`,
        )
        .addStringOption((o) =>
          o
            .setName('pack')
            .setDescription('Pack type')
            .setRequired(true)
            .addChoices(
              {
                name: `Basic — ${tcgPacks.BASIC_PACK_COST}g · 3× C/UC`,
                value: 'basic',
              },
              {
                name: `Advanced — ${tcgPacks.ADVANCED_PACK_COST}g · 4× UC–EP`,
                value: 'advanced',
              },
              {
                name: `Premium — ${tcgPacks.PREMIUM_PACK_COST}g · 5× UC–M`,
                value: 'premium',
              },
              {
                name: `Boss — ${tcgPacks.BOSS_PACK_COST}g · 4× Rare+ guarantee`,
                value: 'boss',
              },
              {
                name: `Region — ${tcgPacks.REGION_PACK_COST}g · 4× region pool`,
                value: 'region',
              },
            ),
        )
        .addIntegerOption((o) =>
          o
            .setName('region')
            .setDescription('Home Turf 1–6 / tcg_region (required for Region pack)')
            .setMinValue(tcgPacks.REGION_ID_MIN)
            .setMaxValue(tcgPacks.REGION_ID_MAX),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('buy_card')
        .setDescription('Buy one catalog copy for a member at a set rarity ([CardSystem.md] direct purchase)')
        .addUserOption((o) =>
          o
            .setName('member')
            .setDescription('Discord user whose card templates to buy (matches card_data.discord_id)')
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('rarity')
            .setDescription('Rarity tier to buy')
            .setRequired(true)
            .addChoices(
              { name: `Common — ${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.C}g`, value: 'C' },
              { name: `Uncommon — ${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.UC}g`, value: 'UC' },
              { name: `Rare — ${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.R}g`, value: 'R' },
              { name: `Epic — ${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.EP}g`, value: 'EP' },
              { name: `Legendary — ${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.L}g`, value: 'L' },
              { name: `Mythic — ${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.M}g`, value: 'M' },
            ),
        )
        .addStringOption((o) => {
          o
            .setName('element')
            .setDescription('Element when multiple templates exist at this rarity (omit = random among matches)');
          o.addChoices({ name: '— Any element', value: 'any' });
          for (const k of ELEMENT_IDS) {
            o.addChoices({ name: DISPLAY_LABEL[k], value: k });
          }
          return o;
        }),
    )
    .addSubcommand((sub) => sub.setName('shop').setDescription('TCG item shop — gold only, daily limits (UTC) ([CardSystem.md])'))
    .addSubcommand((sub) => {
      const b = sub
        .setName('shop_buy')
        .setDescription('Purchase one shop item')
        .addStringOption((opt) => {
          opt.setName('item').setDescription('Item').setRequired(true);
          for (const [sku, def] of Object.entries(tcgShop.SHOP_ITEMS)) {
            opt.addChoices({ name: `${def.label} — ${def.cost}g`, value: sku });
          }
          return opt;
        });
      return b;
    })
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

    if (sub === 'buy_pack') {
      const pack = interaction.options.getString('pack', true);
      let result;
      if (pack === 'basic') result = await tcgPacks.buyBasicPack(client, discordUser);
      else if (pack === 'advanced') result = await tcgPacks.buyAdvancedPack(client, discordUser);
      else if (pack === 'premium') result = await tcgPacks.buyPremiumPack(client, discordUser);
      else if (pack === 'boss') result = await tcgPacks.buyBossPack(client, discordUser);
      else if (pack === 'region') {
        const region = interaction.options.getInteger('region');
        if (region == null) {
          return interaction.editReply({
            content:
              '**Region pack:** set **region** to **1–6** (Home Turf — matches catalog `tcg_region`).',
            ephemeral: true,
          });
        }
        result = await tcgPacks.buyRegionPack(client, discordUser, region);
      } else return interaction.editReply({ content: 'Unknown pack type.', ephemeral: true });

      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }

      const lines = formatTcgPullLines(result.pulls);
      let title = 'Pack';
      let color = 0xf1c40f;
      let pityBlock = '';
      let footer = '';

      if (result.packKind === 'basic') {
        title = 'Basic Pack';
        color = 0xf1c40f;
        const forceAt = tcgPacks.BASIC_PACK_PITY_FORCE_AT;
        if (result.pityTriggered) {
          pityBlock =
            '\n\n**Pity:** Last card was a guaranteed Uncommon (after **9** Basic packs in a row with no Uncommon).';
        } else if (result.pityAfter > 0) {
          if (result.pityAfter >= forceAt) {
            pityBlock = `\n\n**Pity:** Your next Basic Pack will guarantee an Uncommon on the last card (streak **${result.pityAfter}**).`;
          } else {
            const need = forceAt - result.pityAfter;
            pityBlock = `\n\n_Pity streak:_ **${result.pityAfter}** Basic pack(s) with no Uncommon. **${need}** more like that, then the following pack guarantees one on the last card.`;
          }
        }
        footer = `Odds: 70% C / 30% UC. Pity: after ${forceAt} consecutive Basic packs with no Uncommon in any pull, the next pack forces UC on pull 3.`;
      } else if (result.packKind === 'advanced') {
        title = 'Advanced Pack';
        color = 0x9b59b6;
        const forceAt = tcgPacks.ADVANCED_PACK_PITY_FORCE_AT;
        if (result.pityTriggered) {
          pityBlock =
            '\n\n**Pity:** Last card was a guaranteed Epic (after **9** Advanced packs in a row with no Epic or higher).';
        } else if (result.pityAfter > 0) {
          if (result.pityAfter >= forceAt) {
            pityBlock = `\n\n**Pity:** Your next Advanced Pack will guarantee an Epic on the last card (streak **${result.pityAfter}**).`;
          } else {
            const need = forceAt - result.pityAfter;
            pityBlock = `\n\n_Pity streak:_ **${result.pityAfter}** Advanced pack(s) with no Epic or higher. **${need}** more like that, then the following pack guarantees one on the last card.`;
          }
        }
        footer = `Odds: 10% C / 45% UC / 30% R / 14% EP / 1% L. Pity: after ${forceAt} consecutive Advanced packs with no Epic+ in any pull, the next pack forces EP on pull 4.`;
      } else if (result.packKind === 'premium') {
        title = 'Premium Pack';
        color = 0xe67e22;
        const lF = tcgPacks.PREMIUM_LEGENDARY_PITY_FORCE_AT;
        const mF = tcgPacks.PREMIUM_MYTHIC_PITY_FORCE_AT;
        const parts = [];
        if (result.pityMythicTriggered) {
          parts.push(
            '**Pity (Mythic):** Last card was a guaranteed Mythic (after **49** Premium packs in a row with no Mythic).',
          );
        } else if (result.pityLegendaryTriggered) {
          parts.push(
            '**Pity (Legendary):** Last card was a guaranteed Legendary (after **19** Premium packs in a row with no Legendary or Mythic).',
          );
        }
        if (!result.pityMythicTriggered && result.pityMythicAfter > 0) {
          if (result.pityMythicAfter >= mF) {
            parts.push(
              `**Pity (Mythic):** Next Premium Pack guarantees Mythic on the last card (streak **${result.pityMythicAfter}**).`,
            );
          } else {
            const need = mF - result.pityMythicAfter;
            parts.push(
              `_Mythic streak:_ **${result.pityMythicAfter}** — **${need}** more Premium pack(s) with no Mythic, then the following pack guarantees one on the last card.`,
            );
          }
        }
        if (!result.pityLegendaryTriggered && result.pityLegendaryAfter > 0) {
          if (result.pityLegendaryAfter >= lF) {
            parts.push(
              `**Pity (Legendary):** Next Premium Pack guarantees Legendary on the last card (streak **${result.pityLegendaryAfter}**).`,
            );
          } else {
            const need = lF - result.pityLegendaryAfter;
            parts.push(
              `_Legendary streak:_ **${result.pityLegendaryAfter}** — **${need}** more Premium pack(s) with no Legendary/Mythic, then the following pack guarantees one on the last card.`,
            );
          }
        }
        if (parts.length) pityBlock = `\n\n${parts.join('\n')}`;
        footer = `Odds: 5% UC / 35% R / 35% EP / 20% L / 5% M. Pity: Legendary after ${lF} consecutive packs with no L/M; Mythic after ${mF} with no M (Mythic pity wins on the last pull if both apply).`;
      } else if (result.packKind === 'region') {
        title = `Region Pack · Home Turf ${result.regionId}`;
        color = 0x1abc9c;
        footer =
          'Uniform random among catalog cards with this tcg_region (any rarity). No pack pity ([CardSystem.md] Region Pack).';
      } else if (result.packKind === 'boss') {
        title = 'Boss Pack';
        color = 0xa93226;
        const pct = Math.round(tcgPacks.BOSS_PACK_BOSS_TAG_CHANCE * 100);
        if (result.bossTaggedPulls > 0) {
          pityBlock = `\n\n_Boss-tagged catalog cards:_ **${result.bossTaggedPulls}** (\`card_data.is_boss_card\`).`;
        }
        footer = `Guaranteed **Rare+** if none in pulls 1–3 (pull 4 forces R–M). ~${pct}% per card to roll a boss-tagged template first. Flex odds match Advanced ([CardSystem.md] Boss Pack).`;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `**−${result.cost}**g · **${result.newGold.toLocaleString()}**g remaining\n\n${lines.join('\n')}${pityBlock}`,
        )
        .setFooter({ text: footer })
        .setColor(color);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'buy_card') {
      const member = interaction.options.getUser('member', true);
      const rarity = interaction.options.getString('rarity', true);
      const rawEl = interaction.options.getString('element');
      const elementOpt = rawEl && rawEl !== 'any' ? rawEl : null;
      const result = await tcgDirectBuy.buyDirectCatalogCopy(
        client,
        discordUser,
        member,
        rarity,
        elementOpt,
      );
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      const g = result.grant;
      const meta = g.template;
      const el = meta.element ? DISPLAY_LABEL[meta.element] || meta.element : '—';
      const poolHint =
        result.matchCount > 1 && !elementOpt
          ? `\n_${result.matchCount} templates at this rarity — random element; set **element** to pick one._`
          : '';
      return interaction.editReply({
        content: `**−${result.cost}**g · **${result.newGold.toLocaleString()}**g remaining\n**${meta.name}** · ${meta.rarity} · ${el} · copy **#${g.userCardId}**${poolHint}`,
        ephemeral: true,
      });
    }

    if (sub === 'shop') {
      const snap = await tcgShop.getShopSnapshot(client, discordUser);
      const lines = snap.items.map(
        (i) =>
          `**${i.label}** — **${i.cost}**g\n${i.description}\n· Server stock left today: **${i.serverRemaining}** · You can still buy: **${i.playerRemaining}**`,
      );
      const embed = new EmbedBuilder()
        .setTitle('TCG item shop')
        .setDescription(`${lines.join('\n\n')}\n\nUse \`/tcg shop_buy\`.`)
        .setFooter({ text: `UTC date: ${snap.dayUtc} · Resets midnight UTC · [CardSystem.md] Item Shop` })
        .setColor(0x3498db);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'shop_buy') {
      const item = interaction.options.getString('item', true);
      const result = await tcgShop.buyShopItem(client, discordUser, item);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      const bonusLine =
        result.bonusSlotsAdded > 0
          ? `\nInventory cap **+${result.bonusSlotsAdded}** (total shop bonus: **${result.inventoryBonusSlots}**).`
          : '';
      return interaction.editReply({
        content: `**${result.label}** — **−${result.cost}**g · **${result.newGold.toLocaleString()}**g remaining${bonusLine}`,
        ephemeral: true,
      });
    }

    if (sub === 'balance') {
      const bal = await tcgEconomy.getTcgBalance(client, discordUser);
      if (!bal) {
        return interaction.editReply({ content: 'Could not load your profile.', ephemeral: true });
      }
      const owned = await tcgInventory.countInventoryForDiscordUser(client, discordUser);
      const cap = tcgInventory.DEFAULT_INVENTORY_CAP + bal.inventoryBonusSlots;
      const dailyLine = bal.dailyReady
        ? 'Daily login: **ready** (`/tcg daily`)'
        : `Daily login: on cooldown (~${formatDuration(bal.dailyRemainingSec)} remaining)`;
      const bF = tcgPacks.BASIC_PACK_PITY_FORCE_AT;
      const pB = bal.basicPackPity;
      let basicPityLine;
      if (pB <= 0) {
        basicPityLine = '**Basic:** No streak (no consecutive Basic packs with only Commons).';
      } else if (pB >= bF) {
        basicPityLine = `**Basic:** Streak **${pB}** — next Basic Pack guarantees Uncommon on the last card.`;
      } else {
        const need = bF - pB;
        basicPityLine = `**Basic:** Streak **${pB}** — **${need}** more Basic pack(s) with no Uncommon, then the following pack guarantees one.`;
      }

      const aF = tcgPacks.ADVANCED_PACK_PITY_FORCE_AT;
      const pA = bal.advancedPackPity;
      let advancedPityLine;
      if (pA <= 0) {
        advancedPityLine = '**Advanced:** No streak (no consecutive Advanced packs without Epic+).';
      } else if (pA >= aF) {
        advancedPityLine = `**Advanced:** Streak **${pA}** — next Advanced Pack guarantees Epic on the last card.`;
      } else {
        const need = aF - pA;
        advancedPityLine = `**Advanced:** Streak **${pA}** — **${need}** more Advanced pack(s) without Epic+, then the following pack guarantees one.`;
      }

      const lF = tcgPacks.PREMIUM_LEGENDARY_PITY_FORCE_AT;
      const mF = tcgPacks.PREMIUM_MYTHIC_PITY_FORCE_AT;
      const pPL = bal.premiumLegendaryPity;
      const pPM = bal.premiumMythicPity;
      let premLLine;
      if (pPL <= 0) {
        premLLine = '**Premium (Legendary):** No streak (no consecutive Premium packs without L/M).';
      } else if (pPL >= lF) {
        premLLine = `**Premium (Legendary):** Streak **${pPL}** — next Premium Pack guarantees Legendary on the last card.`;
      } else {
        const need = lF - pPL;
        premLLine = `**Premium (Legendary):** Streak **${pPL}** — **${need}** more Premium pack(s) without Legendary/Mythic, then the following pack guarantees one.`;
      }
      let premMLine;
      if (pPM <= 0) {
        premMLine = '**Premium (Mythic):** No streak (no consecutive Premium packs without Mythic).';
      } else if (pPM >= mF) {
        premMLine = `**Premium (Mythic):** Streak **${pPM}** — next Premium Pack guarantees Mythic on the last card.`;
      } else {
        const need = mF - pPM;
        premMLine = `**Premium (Mythic):** Streak **${pPM}** — **${need}** more Premium pack(s) without Mythic, then the following pack guarantees one.`;
      }

      const pityBlock = [basicPityLine, advancedPityLine, premLLine, premMLine].join('\n');

      const embed = new EmbedBuilder()
        .setTitle('TCG profile')
        .addFields(
          { name: 'Gold', value: `${bal.gold.toLocaleString()}g`, inline: true },
          { name: 'XP', value: String(bal.xp), inline: true },
          { name: 'Level', value: String(bal.level), inline: true },
          {
            name: 'Collection',
            value:
              `${owned} / ${cap} cards` +
              (bal.inventoryBonusSlots > 0
                ? `\n_Shop bonus:_ **+${bal.inventoryBonusSlots}** slots (\`/tcg shop\`)`
                : ''),
            inline: false,
          },
          {
            name: 'Packs',
            value: [
              `Basic **${tcgPacks.BASIC_PACK_COST}**g · 3× C/UC`,
              `Advanced **${tcgPacks.ADVANCED_PACK_COST}**g · 4× UC–EP`,
              `Premium **${tcgPacks.PREMIUM_PACK_COST}**g · 5× UC–M`,
              `Boss **${tcgPacks.BOSS_PACK_COST}**g · 4× · 1× Rare+ · boss-tag chance`,
              `Region **${tcgPacks.REGION_PACK_COST}**g · 4× pool · \`region\` ${tcgPacks.REGION_ID_MIN}–${tcgPacks.REGION_ID_MAX}`,
              `Direct **buy_card** — C **${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.C}**g · UC **${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.UC}**g · R **${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.R}**g · EP **${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.EP}**g · L **${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.L}**g · M **${tcgDirectBuy.DIRECT_BUY_GOLD_BY_RARITY.M}**g`,
              `\`/tcg buy_pack\` · \`/tcg buy_card\` · \`/tcg shop\``,
            ].join('\n'),
            inline: false,
          },
          { name: 'Pack pity', value: pityBlock, inline: false },
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
          content: `No cards yet. Open a **Basic Pack** with \`/tcg buy_pack\` or ask staff for \`/tcg grant\`.`,
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
        const reg =
          c.tcg_region != null && c.tcg_region !== ''
            ? ` · PvE region **${c.tcg_region}**`
            : '';
        const cl = c.class ? ` · ${c.class}` : '';
        return `**${label}:** ${c.name} (#${c.user_card_id}) · ${c.rarity} · Lv${c.level} · ${el}${cl}${reg}`;
      };
      const embed = new EmbedBuilder()
        .setTitle('Loadout')
        .setDescription(
          `${fmt(detail.main, 'Main', detail.row.main_user_card_id)}\n`
            + `${fmt(detail.support1, 'Support 1', detail.row.support1_user_card_id)}\n`
            + `${fmt(detail.support2, 'Support 2', detail.row.support2_user_card_id)}\n\n`
            + '_Synergies in **`/tcg spar`** & **`/tcg pve_fight`** (60% cap). Preview: **`/tcg synergy`**. **Home Turf:** `tcg_region` 1–6, PvE only. **Class:** Commander / Guardian / Artisan (+aliases)._',
        )
        .setFooter({ text: '/tcg synergy — optional enemy_element for Counter Build' })
        .setColor(0x9b59b6);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'synergy') {
      const enemyOpt = interaction.options.getString('enemy_element');
      const enemyEl = enemyOpt && enemyOpt !== 'none' ? enemyOpt : null;

      const detail = await tcgLoadout.getLoadoutDetail(client, discordUser);
      if (!detail || !detail.row.main_user_card_id) {
        return interaction.editReply({
          content: 'Equip a **main** card first (`/tcg equip`).',
          ephemeral: true,
        });
      }

      const summary = await tcgPve.getProgressSummary(client, discordUser);
      if (!summary) {
        return interaction.editReply({ content: 'Could not load PvE progress.', ephemeral: true });
      }

      const loadout = {
        main: detail.main,
        support1: detail.support1,
        support2: detail.support2,
      };

      const synSpar = tcgSynergy.computeCombatSynergy(loadout, enemyEl, null);
      const synPve = tcgSynergy.computeCombatSynergy(
        loadout,
        enemyEl,
        Number(summary.current_region),
      );

      const fmt = (syn, label) => {
        const lines =
          syn.summaryLines && syn.summaryLines.length
            ? syn.summaryLines.map((l) => `· ${l}`).join('\n')
            : '_No synergies matched — try supports, classes, rarities, elements, or `tcg_region`._';
        const bits = [];
        if (syn.weaknessImmune) bits.push('Weakness immunity');
        if (syn.goldMult > 1) bits.push(`×${syn.goldMult.toFixed(2)} battle gold`);
        const foot = bits.length ? `\n_${bits.join(' · ')}_` : '';
        return `**${label}**\n${lines}${foot}`;
      };

      const enLine = enemyEl
        ? `Counter Build includes **${DISPLAY_LABEL[enemyEl] || enemyEl}**.`
        : '_Pick **enemy_element** to preview Counter Build._';

      const embed = new EmbedBuilder()
        .setTitle('Loadout — synergy preview')
        .setDescription(
          `${fmt(synSpar, 'Spar (no Home Turf)')}\n\n${fmt(
            synPve,
            `PvE — ${summary.regionName} · Tier ${summary.tierRoman}`,
          )}\n\n${enLine}\n_Bonuses use the 60% cap ([CardSystem.md])._`,
        )
        .setFooter({ text: '/tcg pve_fight uses the PvE column; /tcg spar uses the Spar column.' })
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
      const { sim, goldGained, won, playerLabel, enemyLabel, playerLevel, synergyLines, synergyGoldMult } =
        result;
      const title = won ? 'Spar — victory' : sim.outcome === 'draw' ? 'Spar — draw' : 'Spar — defeat';
      const logText = sim.log.slice(0, 14).join('\n') || '—';
      const goldLine = goldGained
        ? `**+${goldGained}**g${
            synergyGoldMult > 1 ? ` _(×${synergyGoldMult.toFixed(2)} from Pure / Triangle)_` : ''
          }`
        : '**0**g (win for gold)';
      const synBlock =
        synergyLines && synergyLines.length
          ? `\n_Synergy:_ ${synergyLines.join(' · ')}\n`
          : '';
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `**${playerLabel}** (Lv${playerLevel} main) vs **${enemyLabel}** (scaled)${synBlock}`
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

    if (sub === 'pve_progress') {
      const s = await tcgPve.getProgressSummary(client, discordUser);
      if (!s) {
        return interaction.editReply({ content: 'Could not load PvE progress.', ephemeral: true });
      }
      const need = s.battlesRequired;
      const wins = Number(s.wins_in_tier);
      const nextIsBoss = need > 0 && wins === need - 1;
      const embed = new EmbedBuilder()
        .setTitle('PvE progression')
        .setDescription(
          `**${s.regionName}** · Tier **${s.tierRoman}**\n`
            + `Wins this tier: **${wins} / ${need}**${
              nextIsBoss
                ? '\n_Next fight: **Battle Boss** (tougher enemy, bonus gold on win)._\n'
                : '\n'
            }`
            + `Regions unlocked: **1 – ${s.max_region_unlocked}**\n`
            + `Win streak (Dev Sanctum ATK bonus): **${s.pve_win_streak}**\n`
            + `Battle boss pool pity: **${Number(s.pve_bb_pity) || 0} / 11** (card on win, resets on drop)`,
        )
        .setFooter({
          text: 'Battle boss wins can drop a random pool card (40% / 5% dupe; 11th forces). Tier-boss fights later.',
        })
        .setColor(0x3498db);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'pve_travel') {
      const region = interaction.options.getInteger('region', true);
      const tierOpt = interaction.options.getInteger('tier');
      const t = await tcgPve.travelTo(client, discordUser, { region, tier: tierOpt });
      if (!t.ok) {
        return interaction.editReply({ content: t.error, ephemeral: true });
      }
      const need = battlesRequiredForTier(t.progress.current_tier);
      const embed = new EmbedBuilder()
        .setTitle('PvE — travel')
        .setDescription(
          `**${t.regionName}** · Tier **${t.tierRoman}**\n`
            + `Wins this tier: **0 / ${need}**\n`
            + 'Win streak was reset. Use `/tcg pve_fight` to continue.',
        )
        .setColor(0x3498db);
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'pve_fight') {
      const result = await tcgPve.runPveFight(client, discordUser);
      if (!result.ok) {
        return interaction.editReply({ content: result.error, ephemeral: true });
      }
      const {
        sim,
        goldGained,
        won,
        playerLabel,
        enemyLabel,
        playerLevel,
        regionName,
        tierRoman,
        progress,
        battlesRequired,
        tierClearBonus,
        tierCleared,
        battleBossGold,
        isBattleBoss,
        battleBossDrop,
        synergyLines,
        synergyGoldMult,
      } = result;
      const title = won ? 'PvE — victory' : sim.outcome === 'draw' ? 'PvE — draw' : 'PvE — defeat';
      const logText = sim.log.slice(0, 12).join('\n') || '—';
      let goldLine = '**0**g';
      if (won) {
        const nexus = result.fightRegion === 1 ? ' · Nexus +10% on gold' : '';
        const clear =
          tierCleared && tierClearBonus > 0 ? ` · **${tierClearBonus}**g tier clear` : '';
        const boss = battleBossGold > 0 ? ` · **${battleBossGold}**g battle boss` : '';
        const synGold =
          synergyGoldMult > 1 ? ` · ×${synergyGoldMult.toFixed(2)} synergy gold` : '';
        goldLine = `**+${goldGained}**g${boss}${clear}${nexus}${synGold}`;
      }
      const progLine = won
        ? `Tier **${tierRoman}** · ${progress.wins_in_tier} / ${battlesRequired} wins`
        : `Tier **${tierRoman}** · ${progress.wins_in_tier} / ${battlesRequired} wins (no progress on loss)`;
      let poolDropField = null;
      if (isBattleBoss && won && battleBossDrop) {
        const d = battleBossDrop;
        if (d.granted) {
          const el = d.template.element ? `${DISPLAY_LABEL[d.template.element] || d.template.element}` : '—';
          poolDropField = {
            name: 'Pool drop',
            value:
              `**${d.template.name}** · ${d.template.rarity} · ${el} · copy **#${d.userCardId}**${
                d.hardPity ? ' _(pity)_' : ''
              }`,
            inline: false,
          };
        } else if (d.reason === 'grant_failed') {
          poolDropField = {
            name: 'Pool drop',
            value: `No card — ${d.error}`,
            inline: false,
          };
        } else {
          poolDropField = {
            name: 'Pool drop',
            value: `No card this time · pity **${d.pityAfter} / 11**`,
            inline: false,
          };
        }
      }

      const synLine =
        synergyLines && synergyLines.length
          ? `\n_Synergy:_ ${synergyLines.join(' · ')}`
          : '';

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(
          `**${regionName}** · ${progLine}${isBattleBoss ? '\n_Battle Boss encounter._' : ''}${synLine}\n`
            + `**${playerLabel}** (Lv${playerLevel}) vs **${enemyLabel}**\n`
            + `${sim.elementSummary}\n\n${logText}${sim.log.length > 12 ? '\n…' : ''}`,
        )
        .addFields(
          { name: 'Result', value: sim.outcome.toUpperCase(), inline: true },
          { name: 'Gold', value: goldLine, inline: true },
          { name: 'Streak', value: String(progress.pve_win_streak), inline: true },
          ...(poolDropField ? [poolDropField] : []),
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
