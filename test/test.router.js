import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildIndex } from '../src/index.js';
import { JITRouter } from '../src/router.js';
import { SkillBundle } from '../src/bundle.js';

const MANIFESTS = [
  {
    id: 'router-a',
    name: 'Alpha',
    description: 'alpha action step',
    capability: { inputs: [], outputs: ['x:string'] },
  },
  {
    id: 'router-b',
    name: 'Beta',
    description: 'beta processing step',
    capability: { inputs: ['x:string'], outputs: ['y:number'] },
    graph: { depends_on: ['router-a'] },
  },
  {
    id: 'router-c',
    name: 'Gamma',
    description: 'gamma output step',
    capability: { inputs: ['y:number'], outputs: ['z:string'] },
    graph: { depends_on: ['router-b'] },
  },
  {
    id: 'router-d',
    name: 'Delta',
    description: 'delta standalone step',
    capability: { inputs: [], outputs: [] },
  },
  {
    id: 'router-e',
    name: 'Epsilon',
    description: 'epsilon standalone step',
    capability: { inputs: [], outputs: [] },
  },
];

const EMBED_VECS = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
  [0.5, 0.5, 0, 0],
];

// Maps each text to its indexed vector by position
const buildEmbedFn = async (texts) => texts.map((_, i) => EMBED_VECS[i % EMBED_VECS.length]);

// Query always points to router-a's vector — makes ANN + FTS agree on top result
const queryEmbedFn = async () => [[1, 0, 0, 0]];

// Reranker scores by position: first recalled item gets highest score
const positionReranker = async (_query, texts) => texts.map((_, i) => 1 / (i + 1));

describe('JITRouter.find()', () => {
  let dir;
  let router;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-router-'));
    await buildIndex(MANIFESTS, { rootDir: dir, embedFn: buildEmbedFn });
    router = new JITRouter({ indexDir: dir, embedFn: queryEmbedFn, rerankerFn: positionReranker });
  });

  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('returns object with bundle and timings', async () => {
    const result = await router.find({ task: 'alpha action' });
    assert.ok(result.bundle instanceof SkillBundle);
    assert.ok(result.timings !== null && typeof result.timings === 'object');
  });

  test('timings has recall, rerank, graph, hydrate, total as numbers', async () => {
    const { timings } = await router.find({ task: 'alpha action' });
    for (const key of ['recall', 'rerank', 'graph', 'hydrate', 'total']) {
      assert.ok(typeof timings[key] === 'number', `timings.${key} should be a number`);
    }
  });

  test('bundle.manifests is non-empty array of manifest objects', async () => {
    const { bundle } = await router.find({ task: 'alpha action' });
    assert.ok(Array.isArray(bundle.manifests));
    assert.ok(bundle.manifests.length > 0);
    for (const m of bundle.manifests) assert.ok(typeof m.id === 'string');
  });

  test('bundle.steps is array of step objects with step number and skill id', async () => {
    const { bundle } = await router.find({ task: 'alpha action' });
    assert.ok(Array.isArray(bundle.steps));
    for (const s of bundle.steps) {
      assert.ok(typeof s.step === 'number');
      assert.ok(typeof s.skill === 'string');
    }
  });

  test('bundle.plan has deadlocks and ioViolations arrays', async () => {
    const { bundle } = await router.find({ task: 'alpha action' });
    assert.ok(Array.isArray(bundle.plan.deadlocks));
    assert.ok(Array.isArray(bundle.plan.ioViolations));
  });

  test('toAnthropic() produces valid tool descriptors', async () => {
    const { bundle } = await router.find({ task: 'alpha action' });
    const tools = bundle.toAnthropic();
    assert.ok(Array.isArray(tools));
    for (const t of tools) {
      assert.ok(typeof t.name === 'string');
      assert.ok(typeof t.input_schema === 'object');
    }
  });

  test('maxSkills=1 returns exactly 1 skill (router-a has no outgoing deps)', async () => {
    // router-a: ANN + FTS top match; has no outgoing depends_on/complements edges
    // → SKG walk stays at router-a only
    const { bundle } = await router.find({ task: 'alpha action', maxSkills: 1 });
    assert.equal(bundle.manifests.length, 1);
    assert.equal(bundle.manifests[0].id, 'router-a');
  });

  test('tokenBudget=0 does not expand beyond seeds', async () => {
    // With charBudget=0, BFS expansion loop never runs — only the seed node is included
    const { bundle } = await router.find({ task: 'alpha action', tokenBudget: 0, maxSkills: 1 });
    assert.ok(bundle instanceof SkillBundle);
    assert.equal(bundle.manifests.length, 1);
  });
});
