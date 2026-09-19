import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { schemaSql } from '../lib/schema.js';
import { getSeason } from '../lib/season.js';

// Set PGLITE_MODULE to use an external installation without changing app dependencies.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('legacy migration and API operations keep seasons isolated', async () => {
  const db = new PGlite();
  try {
    // Recreate the original schema and a completed 2025 week.
    const legacy = schemaSql.slice(schemaSql.indexOf('CREATE TABLE IF NOT EXISTS teams'), schemaSql.indexOf('  CREATE TABLE IF NOT EXISTS schema_migrations'));
    await db.exec(legacy);
    for (let id = 1; id <= 10; id++) await db.query('INSERT INTO teams (name, espn_id) VALUES ($1, $2)', [`Team ${id}`, String(id)]);
    await db.exec('INSERT INTO schedule VALUES (0, 0, 1, 2); INSERT INTO scores VALUES (0, 1, 100), (0, 2, 80); INSERT INTO awards VALUES (0, 1, 8), (0, 2, 8);');
    await db.exec(schemaSql);
    const history = {};
    for (const table of ['teams', 'schedule', 'scores', 'awards']) history[table] = (await db.query(`SELECT * FROM ${table} WHERE season = 2025 ORDER BY 1, 2`)).rows;
    assert.equal(history.teams.length, 10);
    assert.equal(history.scores[0].score, 100);
    assert.equal(history.awards[0].points, 8);
    assert.equal(history.schedule[0].team_a, 1);
    await db.exec(schemaSql);
    assert.equal((await db.query('SELECT * FROM teams WHERE season = 2026')).rows.length, 10);
    for (const table of ['schedule', 'scores', 'awards']) assert.equal((await db.query(`SELECT * FROM ${table} WHERE season = 2026`)).rows.length, 0);

    const sql = (strings, ...values) => db.query(strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values);
    sql.query = text => db.query(text);
    const context = vm.createContext({ URL, Buffer, console, process: { env: { ADMIN_USER: 'test', ADMIN_PASS: 'test' } } });
    const modules = new Map();
    const pg = new vm.SyntheticModule(['sql'], function () { this.setExport('sql', sql); }, { context });
    async function load(url) {
      if (modules.has(url.href)) return modules.get(url.href);
      const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
      modules.set(url.href, module);
      await module.link((specifier, parent) => specifier === '@vercel/postgres' ? pg : load(new URL(specifier, parent.identifier)));
      return module;
    }
    async function call(name, query = '', method = 'GET', body) {
      const module = await load(new URL(`../api/${name}.js`, import.meta.url));
      if (module.status !== 'evaluated') await module.evaluate();
      const res = { code: 200, setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; }, send(data) { this.data = data; }, end() {} };
      await module.namespace.default({ method, url: `/api/${name}?${query}`, headers: { host: 'localhost', authorization: 'Basic ' + Buffer.from('test:test').toString('base64') }, body }, res);
      assert.equal(res.code, 200, JSON.stringify(res.data));
      return res.data;
    }
    const fresh = await call('standings');
    assert.equal(fresh.season, 2026);
    assert.equal(fresh.latestWeek, null);
    assert.ok(fresh.rows.every(r => Number(r.seasonPts) === 0 && Number(r.rawSum) === 0));
    assert.equal((await call('standings', 'season=2025')).rows[0].seasonPts, 8);
    const teams = await call('teams');
    assert.ok(teams.every(t => t.id > 10));
    await call('schedule', 'generate=1', 'POST');
    const pairs = await call('schedule', 'week=0');
    assert.equal(pairs.length, 5);
    const payload = Object.fromEntries(teams.map((t, i) => [t.id, 100 + i]));
    await call('scores', 'week=0', 'PUT', payload);
    await call('calc', 'week=0', 'POST');
    assert.equal((await call('week', 'season=2026&week=0')).awardsApplied, true);
    assert.equal((await call('week', 'season=2025&week=0')).pairs[0].sum, 180);
    await call('teams', '', 'PUT', { id: teams[0].id, name: 'New 2026 name' });
    await call('teams', `id=${teams[0].id}`, 'DELETE');
    for (const table of Object.keys(history)) assert.deepEqual((await db.query(`SELECT * FROM ${table} WHERE season = 2025 ORDER BY 1, 2`)).rows, history[table]);
    await assert.rejects(db.query('INSERT INTO scores (season, week, team_id, score) VALUES (2026, 1, 1, 99)'), /foreign key/);
    await db.exec(schemaSql);
    assert.equal((await db.query('SELECT * FROM teams WHERE season = 2026')).rows.length, 9, 'rerunning migration does not recreate deleted teams');
  } finally { await db.close(); }
});

test('fresh database initializes and invalid seasons are rejected', async () => {
  const db = new PGlite();
  try { await db.exec(schemaSql); await db.exec(schemaSql); } finally { await db.close(); }
  assert.equal(getSeason(new URL('https://example.test'), {}), 2026);
  for (const value of ['', '2024', '2026.5', 'bad']) {
    let code;
    const res = { status(n) { code = n; return this; }, json() {} };
    assert.equal(getSeason(new URL(`https://example.test?season=${value}`), res), null);
    assert.equal(code, 400);
  }
});
