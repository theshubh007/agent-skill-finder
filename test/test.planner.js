import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planner.js';

// ── PD-L1 fixture ─────────────────────────────────────────────────────────────
const PDL1_MANIFESTS = [
  {
    id: 'scientific-research-lookup',
    capability: { inputs: [], outputs: ['papers:list[Paper]'] },
  },
  {
    id: 'classify-pd-l1-tps',
    capability: { inputs: ['papers:list[Paper]'], outputs: ['tps_scores:dict'] },
  },
  {
    id: 'publication-figure-style',
    capability: { inputs: ['tps_scores:dict'], outputs: ['figure:Path'] },
  },
  {
    id: 'citation-verifier',
    capability: { inputs: ['papers:list[Paper]'], outputs: ['bibtex:str'] },
  },
];

const PDL1_SUBGRAPH = {
  nodes: [
    'scientific-research-lookup',
    'classify-pd-l1-tps',
    'publication-figure-style',
    'citation-verifier',
  ],
  edges: [
    { source: 'scientific-research-lookup', target: 'classify-pd-l1-tps',       relation: 'depends_on' },
    { source: 'scientific-research-lookup', target: 'citation-verifier',         relation: 'depends_on' },
    { source: 'classify-pd-l1-tps',         target: 'publication-figure-style',  relation: 'depends_on' },
  ],
};

function idx(steps, skillId) {
  return steps.findIndex((s) => s.skill === skillId);
}

describe('buildPlan — PD-L1 fixture', () => {
  test('returns one step per subgraph node', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    assert.equal(steps.length, 4);
  });

  test('step numbers are 1-indexed and contiguous', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    const nums = steps.map((s) => s.step).sort((a, b) => a - b);
    assert.deepEqual(nums, [1, 2, 3, 4]);
  });

  test('scientific-research-lookup is step 1 (root, no depends_on)', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    const root = steps.find((s) => s.skill === 'scientific-research-lookup');
    assert.equal(root.step, 1);
    assert.deepEqual(root.dependsOn, []);
  });

  test('classify-pd-l1-tps comes after scientific-research-lookup', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    assert.ok(idx(steps, 'classify-pd-l1-tps') > idx(steps, 'scientific-research-lookup'));
  });

  test('publication-figure-style comes after classify-pd-l1-tps', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    assert.ok(idx(steps, 'publication-figure-style') > idx(steps, 'classify-pd-l1-tps'));
  });

  test('citation-verifier comes after scientific-research-lookup', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    assert.ok(idx(steps, 'citation-verifier') > idx(steps, 'scientific-research-lookup'));
  });

  test('inputs and outputs are parsed from IOType strings', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    const classify = steps.find((s) => s.skill === 'classify-pd-l1-tps');
    assert.deepEqual(classify.inputs,  [{ name: 'papers', type: 'list[Paper]' }]);
    assert.deepEqual(classify.outputs, [{ name: 'tps_scores', type: 'dict' }]);
  });

  test('dependsOn lists are populated from edges', () => {
    const { steps } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    const figure = steps.find((s) => s.skill === 'publication-figure-style');
    assert.deepEqual(figure.dependsOn, ['classify-pd-l1-tps']);
  });

  test('no deadlocks when all depends_on targets are in subgraph', () => {
    const { deadlocks } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    assert.deepEqual(deadlocks, []);
  });

  test('no I/O violations when types match across steps', () => {
    const { ioViolations } = buildPlan(PDL1_SUBGRAPH, PDL1_MANIFESTS);
    assert.deepEqual(ioViolations, []);
  });
});

describe('buildPlan — deadlock detection', () => {
  test('deadlock reported when depends_on target is missing from subgraph', () => {
    const subgraph = {
      nodes: ['a'],
      edges: [{ source: 'a', target: 'missing-dep', relation: 'depends_on' }],
    };
    const { deadlocks } = buildPlan(subgraph, [{ id: 'a' }]);
    assert.ok(deadlocks.includes('missing-dep'));
  });

  test('no deadlock when all dependencies present', () => {
    const subgraph = {
      nodes: ['a', 'b'],
      edges: [{ source: 'a', target: 'b', relation: 'depends_on' }],
    };
    const { deadlocks } = buildPlan(subgraph, [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual(deadlocks, []);
  });
});

describe('buildPlan — I/O violations', () => {
  test('flags violation when output type does not match input type', () => {
    const manifests = [
      { id: 'producer', capability: { inputs: [], outputs: ['data:string'] } },
      { id: 'consumer', capability: { inputs: ['data:number'], outputs: [] } },
    ];
    const subgraph = {
      nodes: ['producer', 'consumer'],
      edges: [{ source: 'producer', target: 'consumer', relation: 'depends_on' }],
    };
    const { ioViolations } = buildPlan(subgraph, manifests);
    assert.equal(ioViolations.length, 1);
    assert.equal(ioViolations[0].from, 'producer');
    assert.equal(ioViolations[0].to, 'consumer');
  });

  test('no violation when type matches', () => {
    const manifests = [
      { id: 'producer', capability: { inputs: [], outputs: ['data:string'] } },
      { id: 'consumer', capability: { inputs: ['data:string'], outputs: [] } },
    ];
    const subgraph = {
      nodes: ['producer', 'consumer'],
      edges: [{ source: 'producer', target: 'consumer', relation: 'depends_on' }],
    };
    const { ioViolations } = buildPlan(subgraph, manifests);
    assert.deepEqual(ioViolations, []);
  });

  test('no violation when step has no inputs defined', () => {
    const manifests = [
      { id: 'a', capability: { inputs: [], outputs: ['x:foo'] } },
      { id: 'b', capability: { inputs: [], outputs: [] } },
    ];
    const subgraph = {
      nodes: ['a', 'b'],
      edges: [{ source: 'a', target: 'b', relation: 'depends_on' }],
    };
    const { ioViolations } = buildPlan(subgraph, manifests);
    assert.deepEqual(ioViolations, []);
  });
});

describe('buildPlan — edge cases', () => {
  test('empty subgraph returns empty steps', () => {
    const { steps, deadlocks } = buildPlan({ nodes: [], edges: [] }, []);
    assert.deepEqual(steps, []);
    assert.deepEqual(deadlocks, []);
  });

  test('single node no edges returns one step', () => {
    const { steps } = buildPlan(
      { nodes: ['a'], edges: [] },
      [{ id: 'a', capability: { inputs: ['q:string'], outputs: ['r:string'] } }],
    );
    assert.equal(steps.length, 1);
    assert.equal(steps[0].step, 1);
    assert.deepEqual(steps[0].dependsOn, []);
  });

  test('accepts Map as manifests argument', () => {
    const mMap = new Map([['a', { id: 'a', capability: { inputs: [], outputs: [] } }]]);
    const { steps } = buildPlan({ nodes: ['a'], edges: [] }, mMap);
    assert.equal(steps.length, 1);
  });

  test('complements edges are not treated as execution dependencies', () => {
    const subgraph = {
      nodes: ['a', 'b'],
      edges: [{ source: 'a', target: 'b', relation: 'complements' }],
    };
    const { steps } = buildPlan(subgraph, [{ id: 'a' }, { id: 'b' }]);
    // complements don't create ordering constraints — both steps appear, dependsOn is empty
    assert.equal(steps.length, 2);
    for (const s of steps) assert.deepEqual(s.dependsOn, []);
  });
});
