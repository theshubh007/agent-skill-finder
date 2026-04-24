import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rerank } from '../src/rerank.js';

const CANDIDATES = [
  { id: 'a', name: 'Alpha',   description: 'First candidate alpha'   },
  { id: 'b', name: 'Beta',    description: 'Second candidate beta'   },
  { id: 'c', name: 'Gamma',   description: 'Third candidate gamma'   },
  { id: 'd', name: 'Delta',   description: 'Fourth candidate delta'  },
  { id: 'e', name: 'Epsilon', description: 'Fifth candidate epsilon' },
];

// Scores descend by index: a=1.0, b=0.9, c=0.8, d=0.7, e=0.6
const descendReranker = async (_q, texts) => texts.map((_, i) => 1 - i * 0.1);

// Scores ascend by index: a=0, b=0.1, c=0.2, d=0.3, e=0.4
const ascendReranker = async (_q, texts) => texts.map((_, i) => i * 0.1);

describe('rerank', () => {
  test('empty candidates → empty result', async () => {
    const result = await rerank('query', [], 30, { rerankerFn: descendReranker });
    assert.deepEqual(result, []);
  });

  test('fewer candidates than topK returns all', async () => {
    const result = await rerank('query', CANDIDATES.slice(0, 3), 30, { rerankerFn: descendReranker });
    assert.equal(result.length, 3);
  });

  test('slices to topK', async () => {
    const result = await rerank('query', CANDIDATES, 3, { rerankerFn: descendReranker });
    assert.equal(result.length, 3);
  });

  test('topK=0 returns empty array', async () => {
    const result = await rerank('query', CANDIDATES, 0, { rerankerFn: descendReranker });
    assert.equal(result.length, 0);
  });

  test('topK=1 returns single item', async () => {
    const result = await rerank('query', CANDIDATES, 1, { rerankerFn: descendReranker });
    assert.equal(result.length, 1);
  });

  test('results sorted by _rerankScore descending', async () => {
    const result = await rerank('query', CANDIDATES, 5, { rerankerFn: descendReranker });
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        result[i - 1]._rerankScore >= result[i]._rerankScore,
        `score[${i - 1}]=${result[i - 1]._rerankScore} < score[${i}]=${result[i]._rerankScore}`,
      );
    }
  });

  test('each result carries _rerankScore', async () => {
    const result = await rerank('query', CANDIDATES, 5, { rerankerFn: descendReranker });
    for (const r of result) {
      assert.ok(typeof r._rerankScore === 'number', `missing _rerankScore on ${r.id}`);
    }
  });

  test('ascendReranker: last candidate ranks first', async () => {
    const result = await rerank('query', CANDIDATES, 5, { rerankerFn: ascendReranker });
    // ascend: e gets score=0.4 → highest → must be first
    assert.equal(result[0].id, 'e');
  });

  test('descendReranker: first candidate ranks first', async () => {
    const result = await rerank('query', CANDIDATES, 5, { rerankerFn: descendReranker });
    assert.equal(result[0].id, 'a');
  });

  test('result preserves original manifest fields', async () => {
    const result = await rerank('query', CANDIDATES.slice(0, 2), 2, { rerankerFn: descendReranker });
    assert.ok(result[0].id);
    assert.ok(result[0].name);
    assert.ok(result[0].description);
  });

  test('_rerankScore does not shadow original fields', async () => {
    const result = await rerank('query', CANDIDATES, 5, { rerankerFn: descendReranker });
    // Verify id/name/description survive the spread
    const a = result.find((r) => r.id === 'a');
    assert.equal(a.name, 'Alpha');
    assert.equal(a.description, 'First candidate alpha');
  });

  test('single candidate returns it with a score', async () => {
    const result = await rerank('query', [CANDIDATES[0]], 5, { rerankerFn: descendReranker });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'a');
    assert.ok(typeof result[0]._rerankScore === 'number');
  });
});
