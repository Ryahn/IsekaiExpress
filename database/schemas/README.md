# database/schemas

The hand-written `*.sql` schema snapshots that used to live here were **deleted** (2026-06-25).
They had drifted from the real schema and were not used by any setup, deploy, or runtime path.

**Knex migrations (`../../migrations/`) and `scripts/verify_schema.js` are the authoritative schema
sources.** To create or verify a database see `../README.md` (`npm run migrate`,
`npm run verify:schema`). The old snapshots remain recoverable from git history if ever needed.

What still lives in this folder (NOT schema snapshots):

- `commands.json`, `dmca.json`, `games.json` — seed/reference data.
- `nginx.conf` — unrelated service config.
