import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simhash, hammingDistance, dedup, loadSkillsBench } from '../eval/loader.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SAMPLE_PATH = join(__dirname, '..', 'eval', 'data', 'sample_100.jsonl');

describe('simhash', () => {
  test('returns two 32-bit integers', () => {
    const [hi, lo] = simhash('parse command line arguments');
    assert.ok(Number.isInteger(hi) && hi >= 0 && hi <= 0xffffffff);
    assert.ok(Number.isInteger(lo) && lo >= 0 && lo <= 0xffffffff);
  });

  test('identical text produces identical fingerprint', () => {
    const a = simhash('fetch data from an HTTP endpoint');
    const b = simhash('fetch data from an HTTP endpoint');
    assert.deepEqual(a, b);
  });

  test('very different texts have high hamming distance', () => {
    const a = simhash('parse json object');
    const b = simhash('deploy kubernetes container cluster');
    const dist = hammingDistance(a, b);
    assert.ok(dist > 10, `expected dist > 10, got ${dist}`);
  });

  test('near-duplicate texts have low hamming distance', () => {
    const a = simhash('search the web for information about climate change');
    const b = simhash('search the web for information about climate');
    const dist = hammingDistance(a, b);
    assert.ok(dist < 20, `expected dist < 20, got ${dist}`);
  });

  test('empty string returns [0, 0]', () => {
    assert.deepEqual(simhash(''), [0, 0]);
  });
});

describe('hammingDistance', () => {
  test('identical fingerprints have distance 0', () => {
    const fp = simhash('hello world');
    assert.equal(hammingDistance(fp, fp), 0);
  });

  test('distance is symmetric', () => {
    const a = simhash('parse arguments');
    const b = simhash('run bash command');
    assert.equal(hammingDistance(a, b), hammingDistance(b, a));
  });
});

describe('dedup', () => {
  test('removes near-duplicate tasks', () => {
    const tasks = [
      { query: 'parse json string to object' },
      { query: 'parse a json string into object' },
      { query: 'deploy kubernetes pod to cluster' },
    ];
    // threshold 20 catches slight rewording of the same task
    const result = dedup(tasks, 20);
    assert.ok(result.length < tasks.length, 'expected dedup to remove at least one task');
  });

  test('keeps distinct tasks', () => {
    const tasks = [
      { query: 'parse json' },
      { query: 'deploy kubernetes' },
      { query: 'send slack message' },
      { query: 'query postgres database' },
      { query: 'generate pdf from html' },
    ];
    const result = dedup(tasks, 4);
    assert.equal(result.length, tasks.length);
  });

  test('first occurrence wins when deduplicating', () => {
    const tasks = [
      { id: 'first', query: 'parse json string to object' },
      { id: 'second', query: 'parse a json string into object' },
    ];
    const result = dedup(tasks, 12);
    if (result.length === 1) {
      assert.equal(result[0].id, 'first');
    }
  });

  test('empty array returns empty array', () => {
    assert.deepEqual(dedup([]), []);
  });
});

describe('loadSkillsBench (sample_100.jsonl)', () => {
  test('loads exactly 100 raw tasks', async () => {
    const { rawCount } = await loadSkillsBench(SAMPLE_PATH);
    assert.equal(rawCount, 100);
  });

  test('dedupCount <= rawCount', async () => {
    const { rawCount, dedupCount } = await loadSkillsBench(SAMPLE_PATH);
    assert.ok(dedupCount <= rawCount);
  });

  test('each task has id, query, relevant, category', async () => {
    const { tasks } = await loadSkillsBench(SAMPLE_PATH);
    for (const t of tasks) {
      assert.ok(typeof t.id === 'number');
      assert.ok(typeof t.query === 'string' && t.query.length > 0);
      assert.ok(Array.isArray(t.relevant));
      assert.ok(typeof t.category === 'string');
    }
  });

  test('tasks span multiple categories', async () => {
    const { tasks } = await loadSkillsBench(SAMPLE_PATH);
    const categories = new Set(tasks.map((t) => t.category));
    assert.ok(categories.size >= 5, `expected ≥5 categories, got ${categories.size}`);
  });
});
