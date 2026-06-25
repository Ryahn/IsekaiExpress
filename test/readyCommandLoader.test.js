// Focused tests for ready.js buildSlashCommand: one good file builds, bad files are isolated
// (throw) so the ready loop can skip them. Uses temp files; no Discord/REST/DB mocks.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { buildSlashCommand } = require('../src/bot/events/ready/ready.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f95bot-cmd-'));
function write(name, src) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, src);
  return p;
}
test.after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test('builds a valid command (object data with toJSON)', async () => {
  const f = write('good.js', "module.exports={category:'misc',data:{name:'ping',description:'p',toJSON(){return {name:'ping',description:'p'};}}};");
  const r = await buildSlashCommand({}, f);
  assert.equal(r.commandData.name, 'ping');
  assert.deepEqual(r.json, { name: 'ping', description: 'p' });
});

test('supports async data(client)', async () => {
  const f = write('asyncdata.js', "module.exports={category:'misc',data:async()=>({name:'mod',description:'m',toJSON(){return {name:'mod'};}})};");
  const r = await buildSlashCommand({ any: 1 }, f);
  assert.equal(r.commandData.name, 'mod');
});

test('throws on require failure (caller skips the file)', async () => {
  const f = write('boom.js', "throw new Error('load boom');");
  await assert.rejects(() => buildSlashCommand({}, f), /load boom/);
});

test('returns null for a non-command module (no data export) — skipped silently', async () => {
  const f = write('nodata.js', "module.exports={category:'misc'};");
  assert.equal(await buildSlashCommand({}, f), null);
});

test('throws when toJSON() itself throws', async () => {
  const f = write('badjson.js', "module.exports={category:'misc',data:{name:'x',toJSON(){throw new Error('bad json');}}};");
  await assert.rejects(() => buildSlashCommand({}, f), /bad json/);
});
