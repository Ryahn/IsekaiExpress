/**
 * Seed rows for tcg_abilities + runtime pools (Stage 1).
 */
const ABILITY_SEEDS = [
  { ability_key: 'tenacity', tier: 1, name: 'Tenacity', description: '+10% ATK when HP below 50%' },
  { ability_key: 'bulwark', tier: 1, name: 'Bulwark', description: '+10% DEF on first round' },
  { ability_key: 'quick_draw', tier: 1, name: 'Quick Draw', description: '+15% SPD on first round only' },
  { ability_key: 'steady', tier: 1, name: 'Steady', description: 'Reduces incoming damage by 5% flat' },
  { ability_key: 'scrapper', tier: 1, name: 'Scrapper', description: '+5% ATK for each round survived' },
  { ability_key: 'retaliate', tier: 2, name: 'Retaliate', description: 'Reflects 15% of damage taken back to attacker' },
  { ability_key: 'momentum', tier: 2, name: 'Momentum', description: 'Each consecutive win in a session stacks +5% ATK (max 3 stacks)' },
  { ability_key: 'iron_will', tier: 2, name: 'Iron Will', description: 'Survive one killing blow at 1 HP once per battle' },
  { ability_key: 'exploit', tier: 2, name: 'Exploit', description: '+20% ATK against enemies with higher DEF' },
  { ability_key: 'phantom_step', tier: 2, name: 'Phantom Step', description: '20% chance to dodge an attack entirely' },
  { ability_key: 'apex_predator', tier: 3, name: 'Apex Predator', description: '+25% ATK and SPD when facing a higher rarity card' },
  { ability_key: 'unbreakable', tier: 3, name: 'Unbreakable', description: 'DEF cannot be reduced below 50% of base value' },
  { ability_key: 'death_mark', tier: 3, name: 'Death Mark', description: 'Enemy loses 5% HP at the start of each round passively' },
  { ability_key: 'last_stand', tier: 3, name: 'Last Stand', description: 'Below 25% HP, all stats increase by 30%' },
  { ability_key: 'sovereign', tier: 3, name: 'Sovereign', description: 'Immune to item effects used by the opponent' },
  { ability_key: 'eternal_flame', tier: 4, name: 'Eternal Flame', description: 'Deals 3% of enemy max HP as bonus damage every round' },
  { ability_key: 'colossus', tier: 4, name: 'Colossus', description: 'All stats +20% when facing a Legendary or Mythic card' },
  { ability_key: 'time_thief', tier: 4, name: 'Time Thief', description: 'Steals 10% of enemy ATK permanently for the duration of the battle' },
  { ability_key: 'wardens_eye', tier: 4, name: "Warden's Eye", description: 'Reduces all incoming damage by 25% flat' },
  { ability_key: 'void_touch', tier: 4, name: 'Void Touch', description: 'Enemy passive ability is completely nullified' },
  { ability_key: 'berserkers_call', tier: 4, name: "Berserker's Call", description: 'Each round survived grants +8% ATK stacking with no cap' },
  { ability_key: 'absolute_zero', tier: 4, name: 'Absolute Zero', description: 'Enemy SPD reduced to minimum on round 1, can never exceed yours' },
  { ability_key: 'soulbind', tier: 4, name: 'Soulbind', description: 'If you lose the battle, opponent gains no gold or RP from the win' },
];

module.exports = { ABILITY_SEEDS };
