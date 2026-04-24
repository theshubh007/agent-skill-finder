import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hitAtK, reciprocalRank, evaluate,
  compositionSuccessRate, compositionDeadlockRate,
  tokenReduction, latencyPercentiles,
  slopGatePrecision, fullReport,
} from '../eval/metrics.js';

// ── Retrieval (existing) ──────────────────────────────────────────────────────

describe('hitAtK', () => {
  test('returns 1 when relevant in top-K', () => {
    assert.equal(hitAtK(['a', 'b', 'c'], new Set(['b']), 3), 1);
  });
  test('returns 0 when relevant outside top-K', () => {
    assert.equal(hitAtK(['a', 'b', 'c'], new Set(['c']), 2), 0);
  });
});

describe('reciprocalRank', () => {
  test('returns 1 for rank-1 hit', () => {
    assert.equal(reciprocalRank(['a', 'b'], new Set(['a'])), 1);
  });
  test('returns 0.5 for rank-2 hit', () => {
    assert.equal(reciprocalRank(['a', 'b'], new Set(['b'])), 0.5);
  });
  test('returns 0 when no hit within maxRank', () => {
    assert.equal(reciprocalRank(['a', 'b'], new Set(['z']), 2), 0);
  });
});

// ── Composition ───────────────────────────────────────────────────────────────

describe('compositionSuccessRate', () => {
  function makeBundle(ids, deadlocks = []) {
    return { manifests: ids.map((id) => ({ id })), plan: { deadlocks } };
  }

  test('1.0 when all required present and no deadlocks', () => {
    const bundles = [makeBundle(['a', 'b']), makeBundle(['c'])];
    assert.equal(compositionSuccessRate(bundles, [['a', 'b'], ['c']]), 1);
  });

  test('0 when required skill missing', () => {
    const bundles = [makeBundle(['a'])];
    assert.equal(compositionSuccessRate(bundles, [['a', 'b']]), 0);
  });

  test('0 when deadlock present', () => {
    const bundles = [makeBundle(['a', 'b'], ['a→b cycle'])];
    assert.equal(compositionSuccessRate(bundles, [['a', 'b']]), 0);
  });

  test('0 for empty bundles', () => {
    assert.equal(compositionSuccessRate([], []), 0);
  });
});

describe('compositionDeadlockRate', () => {
  test('0 when no bundles have deadlocks', () => {
    const bundles = [{ plan: { deadlocks: [] } }, { plan: { deadlocks: [] } }];
    assert.equal(compositionDeadlockRate(bundles), 0);
  });

  test('1.0 when all bundles have deadlocks', () => {
    const bundles = [{ plan: { deadlocks: ['x'] } }, { plan: { deadlocks: ['y'] } }];
    assert.equal(compositionDeadlockRate(bundles), 1);
  });

  test('0.5 for half with deadlocks', () => {
    const bundles = [{ plan: { deadlocks: [] } }, { plan: { deadlocks: ['x'] } }];
    assert.equal(compositionDeadlockRate(bundles), 0.5);
  });
});

// ── Efficiency ────────────────────────────────────────────────────────────────

describe('tokenReduction', () => {
  test('0.9 when bundle uses 10% of total tokens', () => {
    assert.equal(tokenReduction(1000, 100), 0.9);
  });

  test('0 for equal total and bundle tokens', () => {
    assert.equal(tokenReduction(100, 100), 0);
  });

  test('0 for totalTokens = 0', () => {
    assert.equal(tokenReduction(0, 50), 0);
  });

  test('clamps to 1 if bundleTokens > totalTokens', () => {
    assert.equal(tokenReduction(100, 0), 1);
  });
});

describe('latencyPercentiles', () => {
  test('p50 and p95 from sorted samples', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const { p50, p95 } = latencyPercentiles(samples);
    assert.ok(p50 >= 50 && p50 <= 51);
    assert.ok(p95 >= 95 && p95 <= 96);
  });

  test('empty samples returns 0/0', () => {
    assert.deepEqual(latencyPercentiles([]), { p50: 0, p95: 0 });
  });

  test('single sample returns same value for p50 and p95', () => {
    const { p50, p95 } = latencyPercentiles([42]);
    assert.equal(p50, 42);
    assert.equal(p95, 42);
  });
});

// ── Quality ───────────────────────────────────────────────────────────────────

describe('slopGatePrecision', () => {
  test('1.0 when all flagged are true positives', () => {
    const flagged = [{ id: 'a' }, { id: 'b' }];
    assert.equal(slopGatePrecision(flagged, new Set(['a', 'b'])), 1);
  });

  test('0.5 when half are true positives', () => {
    const flagged = [{ id: 'a' }, { id: 'b' }];
    assert.equal(slopGatePrecision(flagged, new Set(['a'])), 0.5);
  });

  test('0 for empty flagged', () => {
    assert.equal(slopGatePrecision([], new Set(['a'])), 0);
  });
});

// ── Full 14-metric report ─────────────────────────────────────────────────────

describe('fullReport', () => {
  test('returns all 14 metric keys', async () => {
    const expected = [
      'Hit@1', 'Hit@5', 'Hit@20', 'MRR',
      'CSR', 'CDR',
      'TLIS', 'GNCI', 'CFI', 'RScore',
      'TokenReduction', 'Latency_p50', 'Latency_p95',
      'SlopPrecision',
    ];
    const report = await fullReport();
    for (const key of expected) {
      assert.ok(key in report, `missing key: ${key}`);
    }
  });

  test('all values are numbers', async () => {
    const report = await fullReport();
    for (const [k, v] of Object.entries(report)) {
      assert.ok(typeof v === 'number', `${k} not a number`);
    }
  });

  test('graph metrics forwarded from graphMetrics input', async () => {
    const report = await fullReport({ graphMetrics: { tlis: 0.1, gnci: 5, cfi: 3, rscore: 0.9 } });
    assert.equal(report.TLIS, 0.1);
    assert.equal(report.GNCI, 5);
    assert.equal(report.RScore, 0.9);
  });
});
