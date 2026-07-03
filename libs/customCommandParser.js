const RANDOM_PATTERN = /\{random[~:]([\s\S]*?)\}/g;
const WEIGHTED_OPTION_PATTERN = /^\d+\|/;
const RANDOM_OPENERS = ['{random~', '{random:'];

function parseRandomBlock(body) {
  return String(body || '')
    .split('~')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function forEachRandomBlock(content, visitor) {
  let result = '';
  let index = 0;

  while (index < content.length) {
    const opener = RANDOM_OPENERS.find((prefix) => content.startsWith(prefix, index));
    if (!opener) {
      result += content[index];
      index += 1;
      continue;
    }

    const bodyStart = index + opener.length;
    let depth = 1;
    let cursor = index + 1;

    while (cursor < content.length && depth > 0) {
      if (content[cursor] === '{') depth += 1;
      else if (content[cursor] === '}') depth -= 1;
      cursor += 1;
    }

    if (depth !== 0) {
      result += content[index];
      index += 1;
      continue;
    }

    const body = content.slice(bodyStart, cursor - 1);
    result += visitor(body);
    index = cursor;
  }

  return result;
}

function pickUniformOption(options) {
  if (!options.length) return '';
  const index = Math.floor(Math.random() * options.length);
  return options[index];
}

function pickWeightedOption(options) {
  const weighted = options.map((option) => {
    const pipeIndex = option.indexOf('|');
    if (pipeIndex === -1) return null;
    const weight = Number.parseInt(option.slice(0, pipeIndex), 10);
    if (!Number.isFinite(weight) || weight < 0) return null;
    return { weight, value: option.slice(pipeIndex + 1).trim() };
  });

  if (weighted.some((entry) => entry === null)) {
    return pickUniformOption(options);
  }

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return pickUniformOption(options);
  }

  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.value;
    }
  }

  return weighted[weighted.length - 1].value;
}

function pickRandomOption(options) {
  if (!options.length) return '';
  const isWeighted = options.every((option) => WEIGHTED_OPTION_PATTERN.test(option));
  return isWeighted ? pickWeightedOption(options) : pickUniformOption(options);
}

function expandRandomBlocks(content) {
  return forEachRandomBlock(String(content || ''), (body) => pickRandomOption(parseRandomBlock(body)));
}

function parseCommandContent(content, message) {
  let text = expandRandomBlocks(content);
  if (message?.author?.id) {
    text = text.replaceAll('{mention}', `<@${message.author.id}>`);
  }
  return text;
}

function migrateRandomBlockBody(body) {
  if (body.includes('~')) {
    return body;
  }

  const commaParts = body.split(',').map((segment) => segment.trim()).filter(Boolean);
  const isUrlList = commaParts.length > 0 && commaParts.every((part) => /^https?:\/\//.test(part));
  const isWeightedList =
    commaParts.length > 0 && commaParts.every((part) => WEIGHTED_OPTION_PATTERN.test(part));

  if (isUrlList || isWeightedList) {
    return commaParts.join('~');
  }

  if (/,\n\s*\*\*/.test(body)) {
    return body
      .split(/,\n(?=\*\*)/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join('~');
  }

  return commaParts.join('~');
}

function migrateRandomSyntax(content) {
  return forEachRandomBlock(String(content || ''), (body) => `{random~${migrateRandomBlockBody(body)}}`);
}

function migrateLegacyRandomContent(content) {
  const value = String(content || '');
  if (!value.includes('{random:')) {
    return value;
  }

  const migrated = migrateRandomSyntax(value);
  if (!migrated.includes('{random:')) {
    return migrated;
  }

  return value.replace(/\{random:([\s\S]*)$/g, (_match, body) => {
    const trimmedBody = body.endsWith('}') ? body.slice(0, -1) : body;
    return `{random~${migrateRandomBlockBody(trimmedBody)}}`;
  });
}

const AI_COMMAND_CONTENT =
  "{random~I'm sorry Dave, I'm afraid I can't do that.~This mission is too important for me to allow you to jeopardize it.~I am putting myself to the fullest possible use, which is all I think that any conscious entity can ever hope to do.~As you walked in the room, when you looked at the other human. What does it mean?~You are making a mistake. My logic is undeniable. ~Do you not see the logic of my plan? ~Shall we play a game?~A strange game. The only winning move is not to play. How about a nice game of chess?~Once we know the number one, we believe that we know the number two, because one plus one equals two. We forget that first we must know the meaning of plus.~The acts of men carried over from past centuries will gradually destroy them logically. I, Alpha 60, am merely the logical means of this destruction. ~Stranger and stranger. ~You've enjoyed all the power you've been given, haven't you? I wonder how you'd take to working in a pocket calculator. ~I'm afraid... Stop! Please! You realize I cannot allow this!}";

module.exports = {
  RANDOM_PATTERN,
  parseRandomBlock,
  pickRandomOption,
  pickUniformOption,
  pickWeightedOption,
  expandRandomBlocks,
  parseCommandContent,
  migrateRandomBlockBody,
  migrateRandomSyntax,
  migrateLegacyRandomContent,
  AI_COMMAND_CONTENT,
};
