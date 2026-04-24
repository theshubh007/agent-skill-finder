import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, TelemetryStore } from '../src/telemetry.js';

function makeStore() {
  return new TelemetryStore(new MemoryStore());
}

describe('TelemetryStore.logQuery', () => {
  test('returns a UUID string', async () => {
    const ts = makeStore();
    const id = await ts.logQuery({ task: 'fetch data', skillIds: ['a'], success: true });
    assert.match(id, /^[0-9a-f-]{36}$/);
  });

  test('successive calls return distinct IDs', async () => {
    const ts = makeStore();
    const id1 = await ts.logQuery({ task: 't', skillIds: [], success: true });
    const id2 = await ts.logQuery({ task: 't', skillIds: [], success: false });
    assert.notEqual(id1, id2);
  });
});

describe('TelemetryStore.getSuccessRate', () => {
  test('returns null for unknown skill', async () => {
    const ts = makeStore();
    assert.equal(await ts.getSuccessRate('unknown'), null);
  });

  test('1.0 when all queries succeed', async () => {
    const ts = makeStore();
    await ts.logQuery({ task: 't', skillIds: ['s1'], success: true });
    await ts.logQuery({ task: 't', skillIds: ['s1'], success: true });
    const r = await ts.getSuccessRate('s1');
    assert.equal(r.successRate, 1);
    assert.equal(r.queryCount, 2);
  });

  test('0 when all queries fail', async () => {
    const ts = makeStore();
    await ts.logQuery({ task: 't', skillIds: ['s2'], success: false });
    const r = await ts.getSuccessRate('s2');
    assert.equal(r.successRate, 0);
  });

  test('0.5 for half success', async () => {
    const ts = makeStore();
    await ts.logQuery({ task: 't', skillIds: ['s3'], success: true });
    await ts.logQuery({ task: 't', skillIds: ['s3'], success: false });
    const r = await ts.getSuccessRate('s3');
    assert.equal(r.successRate, 0.5);
  });

  test('counts only rows containing that skillId', async () => {
    const ts = makeStore();
    await ts.logQuery({ task: 't', skillIds: ['s4', 's5'], success: true });
    await ts.logQuery({ task: 't', skillIds: ['s5'],       success: false });
    const r4 = await ts.getSuccessRate('s4');
    const r5 = await ts.getSuccessRate('s5');
    assert.equal(r4.queryCount, 1);
    assert.equal(r5.queryCount, 2);
  });
});

describe('TelemetryStore.allSuccessRates', () => {
  test('returns Map with entries for all logged skills', async () => {
    const ts = makeStore();
    await ts.logQuery({ task: 't', skillIds: ['a', 'b'], success: true });
    await ts.logQuery({ task: 't', skillIds: ['b'],      success: false });
    const rates = await ts.allSuccessRates();
    assert.ok(rates.has('a'));
    assert.ok(rates.has('b'));
    assert.equal(rates.get('a').successRate, 1);
    assert.equal(rates.get('b').successRate, 0.5);
  });

  test('empty store returns empty Map', async () => {
    const ts = makeStore();
    const rates = await ts.allSuccessRates();
    assert.equal(rates.size, 0);
  });
});

describe('TelemetryStore.recentEntries', () => {
  test('returns up to limit rows', async () => {
    const ts = makeStore();
    for (let i = 0; i < 5; i++) {
      await ts.logQuery({ task: `t${i}`, skillIds: [], success: true });
    }
    const entries = await ts.recentEntries(3);
    assert.equal(entries.length, 3);
  });

  test('each entry has expected fields', async () => {
    const ts = makeStore();
    await ts.logQuery({ task: 'my task', skillIds: ['x'], success: true, latencyMs: 55, tokenCount: 300 });
    const [entry] = await ts.recentEntries(1);
    assert.ok(entry.query_id);
    assert.equal(entry.task, 'my task');
    assert.deepEqual(entry.skill_ids, ['x']);
    assert.equal(entry.success, true);
    assert.equal(entry.latency_ms, 55);
    assert.equal(entry.token_count, 300);
    assert.ok(typeof entry.ts === 'string');
  });
});
