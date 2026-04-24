import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyword0 } from '../eval/baselines/keyword0.js';
import { createStatic100 } from '../eval/baselines/static100.js';
import { createSemantic5 } from '../eval/baselines/semantic5.js';
import { createGapTd5 } from '../eval/baselines/gaptd5.js';
import { SkillBundle } from '../src/bundle.js';

const MANIFESTS = [
  { id: 'web-search',   name: 'Web Search',   description: 'Search the internet for information' },
  { id: 'json-parse',   name: 'JSON Parser',  description: 'Parse JSON string into object' },
  { id: 'file-read',    name: 'File Read',    description: 'Read a file from the filesystem' },
  { id: 'bash-exec',    name: 'Bash Exec',    description: 'Execute a bash shell command' },
  { id: 'http-fetch',   name: 'HTTP Fetch',   description: 'Fetch data from an HTTP endpoint' },
];

// ── Keyword-0 ─────────────────────────────────────────────────────────────────

describe('Keyword-0 baseline', () => {
  test('returns all manifests ranked', async () => {
    const b = createKeyword0(MANIFESTS);
    const ranked = await b.rank('search the web');
    assert.equal(ranked.length, MANIFESTS.length);
  });

  test('name is Keyword-0', () => {
    assert.equal(createKeyword0(MANIFESTS).name, 'Keyword-0');
  });

  test('exact-match skill ranks first', async () => {
    const b = createKeyword0(MANIFESTS);
    const ranked = await b.rank('parse json string');
    assert.equal(ranked[0], 'json-parse');
  });

  test('empty manifests returns empty ranked list', async () => {
    const ranked = await createKeyword0([]).rank('anything');
    assert.deepEqual(ranked, []);
  });
});

// ── Static-100 ────────────────────────────────────────────────────────────────

describe('Static-100 baseline', () => {
  test('returns same list for any query', async () => {
    const b = createStatic100(MANIFESTS);
    const r1 = await b.rank('parse json');
    const r2 = await b.rank('execute bash');
    assert.deepEqual(r1, r2);
  });

  test('name is Static-100', () => {
    assert.equal(createStatic100(MANIFESTS).name, 'Static-100');
  });

  test('respects n cap', async () => {
    const b = createStatic100(MANIFESTS, 3);
    const ranked = await b.rank('anything');
    assert.equal(ranked.length, 3);
  });

  test('returns all when n >= manifests.length', async () => {
    const b = createStatic100(MANIFESTS, 100);
    const ranked = await b.rank('x');
    assert.equal(ranked.length, MANIFESTS.length);
  });
});

// ── Semantic-5 ────────────────────────────────────────────────────────────────

describe('Semantic-5 baseline', () => {
  test('delegates to recallFn and maps to ids', async () => {
    const recall = async (_q, k) => MANIFESTS.slice(0, k).map((m) => ({ id: m.id, score: 1 }));
    const b = createSemantic5(recall, 3);
    const ranked = await b.rank('search');
    assert.equal(ranked.length, 3);
    assert.equal(ranked[0], MANIFESTS[0].id);
  });

  test('name is Semantic-5', () => {
    assert.equal(createSemantic5(async () => [], 5).name, 'Semantic-5');
  });

  test('empty recall returns empty list', async () => {
    const b = createSemantic5(async () => []);
    assert.deepEqual(await b.rank('x'), []);
  });
});

// ── GAP-TD-5 ──────────────────────────────────────────────────────────────────

describe('GAP-TD-5 baseline', () => {
  function makeRouter(manifests) {
    return {
      async find({ maxSkills = 5 }) {
        const slice = manifests.slice(0, maxSkills);
        const bundle = new SkillBundle(slice);
        return { bundle, timings: { total: 1 } };
      },
    };
  }

  test('returns manifest ids from router bundle', async () => {
    const b = createGapTd5(makeRouter(MANIFESTS), 3);
    const ranked = await b.rank('search the web');
    assert.equal(ranked.length, 3);
  });

  test('name is GAP-TD-5', () => {
    assert.equal(createGapTd5(makeRouter(MANIFESTS)).name, 'GAP-TD-5');
  });

  test('respects maxSkills', async () => {
    const b = createGapTd5(makeRouter(MANIFESTS), 2);
    const ranked = await b.rank('anything');
    assert.equal(ranked.length, 2);
  });
});
