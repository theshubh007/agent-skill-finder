import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildIndex } from '../src/index.js';
import { JITRouter } from '../src/router.js';

// PD-L1 pipeline fixture: 4-skill scientific figure workflow
const PDL1_MANIFESTS = [
  {
    id: 'scientific-research-lookup',
    name: 'Scientific Research Lookup',
    description: 'Search scientific literature and retrieve papers about a topic',
    capability: { inputs: [], outputs: ['papers:list[Paper]'] },
  },
  {
    id: 'classify-pd-l1-tps',
    name: 'Classify PD-L1 TPS',
    description: 'Classify PD-L1 tumor proportion score from retrieved papers',
    capability: { inputs: ['papers:list[Paper]'], outputs: ['tps_scores:dict'] },
    graph: { depends_on: ['scientific-research-lookup'] },
  },
  {
    id: 'publication-figure-style',
    name: 'Publication Figure Style',
    description: 'Generate publication-quality figure in Nature journal style',
    capability: { inputs: ['tps_scores:dict'], outputs: ['figure:Path'] },
    graph: { depends_on: ['classify-pd-l1-tps'] },
  },
  {
    id: 'citation-verifier',
    name: 'Citation Verifier',
    description: 'Verify and format citations from papers into BibTeX',
    capability: { inputs: ['papers:list[Paper]'], outputs: ['bibtex:str'] },
    graph: { depends_on: ['scientific-research-lookup'] },
  },
];

// Uniform score so reranker does not affect step order (BM25 recall order = step order)
const uniformReranker = async (_query, texts) => texts.map(() => 1.0);

describe('JITRouter — PD-L1 end-to-end', () => {
  let dir;
  let bundle;
  let timings;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'asf-e2e-'));
    await buildIndex(PDL1_MANIFESTS, { rootDir: dir });
    const router = new JITRouter({
      indexDir: dir,
      rerankerFn: uniformReranker,
    });
    ({ bundle, timings } = await router.find({
      task: 'find papers about PD-L1 expression in breast cancer and produce a Nature-style figure',
      maxSkills: 4,
    }));
  });

  after(() => { rmSync(dir, { recursive: true, force: true }); });

  test('bundle contains all 4 PD-L1 skills', () => {
    const ids = new Set(bundle.manifests.map((m) => m.id));
    assert.ok(ids.has('scientific-research-lookup'));
    assert.ok(ids.has('classify-pd-l1-tps'));
    assert.ok(ids.has('publication-figure-style'));
    assert.ok(ids.has('citation-verifier'));
  });

  test('bundle has exactly 4 steps', () => {
    assert.equal(bundle.steps.length, 4);
  });

  test('all 4 skills appear in steps', () => {
    const skillIds = new Set(bundle.steps.map((s) => s.skill));
    assert.ok(skillIds.has('scientific-research-lookup'));
    assert.ok(skillIds.has('classify-pd-l1-tps'));
    assert.ok(skillIds.has('publication-figure-style'));
    assert.ok(skillIds.has('citation-verifier'));
  });

  test('timings reported for all stages and total > 0', () => {
    for (const key of ['recall', 'rerank', 'graph', 'hydrate', 'total']) {
      assert.ok(typeof timings[key] === 'number', `timings.${key} not a number`);
    }
    assert.ok(timings.total > 0);
    // With injectable fns (no model download), total should complete well under 1s
    assert.ok(timings.total < 1000, `total ${timings.total}ms exceeded CI bound`);
  });

  test('toAnthropic() includes scientific_research_lookup and classify_pd_l1_tps', () => {
    const names = bundle.toAnthropic().map((t) => t.name);
    assert.ok(names.includes('scientific_research_lookup'));
    assert.ok(names.includes('classify_pd_l1_tps'));
    assert.ok(names.includes('publication_figure_style'));
    assert.ok(names.includes('citation_verifier'));
  });

  test('bundle.plan.deadlocks is empty (all deps resolved)', () => {
    assert.deepEqual(bundle.plan.deadlocks, []);
  });
});
