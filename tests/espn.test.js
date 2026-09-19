import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseScheduleScores } from '../lib/espn-scores.js';

test('full-season schedules do not overwrite requested-week scores', () => {
  const schedule = [
    { matchupPeriodId: 1, home: { teamId: 1, totalPoints: 110 }, away: { teamId: 2, totalPoints: 90 } },
    { matchupPeriodId: 2, home: { teamId: 1, totalPoints: 0 }, away: { teamId: 2, totalPoints: 0 } },
  ];
  assert.deepEqual(parseScheduleScores(schedule, 1), [{ espnTeamId: 1, points: 110 }, { espnTeamId: 2, points: 90 }]);
  assert.deepEqual(parseScheduleScores(schedule, 2), [{ espnTeamId: 1, points: 0 }, { espnTeamId: 2, points: 0 }]);
  assert.deepEqual(parseScheduleScores(schedule, 3), []);
});

test('weekly totals take priority over multi-week matchup totals; byes are included', () => {
  assert.deepEqual(parseScheduleScores([{ matchupPeriodId: 1, home: { teamId: 1, totalPoints: 200, pointsByScoringPeriod: { 1: 90, 2: 110 } } }], 2), [{ espnTeamId: 1, points: 110 }]);
});

test('missing scores stay missing; explicit zero and negative scores are valid', () => {
  assert.deepEqual(parseScheduleScores([
    { matchupPeriodId: 1, home: { teamId: 1, totalPoints: null }, away: { teamId: 2 } },
    { matchupPeriodId: 1, home: { teamId: 3, totalPoints: 0 }, away: { teamId: 4, totalPoints: -2 } },
  ], 1), [{ espnTeamId: 3, points: 0 }, { espnTeamId: 4, points: -2 }]);
});

import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('admin reports ESPN errors without claiming success or changing scores', async () => {
  const html = await readFile(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const script = html.slice(html.indexOf('// ESPN weekly fetch autofill'), html.indexOf('// ----------------- ESPN Mapping'));
  let click;
  const button = { addEventListener(type, fn) { click = fn; } };
  const score = { value: '123.45' };
  const alerts = [];
  vm.runInNewContext(script, {
    document: { getElementById(id) { return id === 'fetchEspnBtn' ? button : id === 'scoreWeek' ? { value: '0' } : score; } },
    api: async () => ({ ok: false, error: 'ESPN denied access' }),
    alert: message => alerts.push(message),
  });
  await click();
  assert.deepEqual(alerts, ['Could not fetch ESPN scores: ESPN denied access']);
  assert.equal(score.value, '123.45');
  assert.equal(button.disabled, false);
});
