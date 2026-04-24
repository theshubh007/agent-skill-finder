import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from 'graphology';
import { computeTLIS, computeGNCI, computeCFI, computeRScore, routingRisk, failureModes } from '../src/metrics.js';

function makeCommunities(entries) {
  return new Map(entries.map((e, i) => [i, { nodes: e.nodes, label: e.label, cohesion: 1 }]));
}

describe('computeTLIS', () => {
  test('empty graph returns 0', () => {
    assert.equal(computeTLIS(new DirectedGraph()), 0);
  });

  test('all isolated returns 1', () => {
    const G = new DirectedGraph();
    G.addNode('a', {}); G.addNode('b', {});
    assert.equal(computeTLIS(G), 1);
  });

  test('no isolated nodes returns 0', () => {
    const G = new DirectedGraph();
    G.addNode('a', {}); G.addNode('b', {});
    G.addEdge('a', 'b', {});
    assert.equal(computeTLIS(G), 0);
  });

  test('partial isolation returns ratio', () => {
    const G = new DirectedGraph();
    G.addNode('a', {}); G.addNode('b', {}); G.addNode('c', {});
    G.addEdge('a', 'b', {});
    // c is isolated → TLIS = 1/3
    const tlis = computeTLIS(G);
    assert.ok(tlis > 0 && tlis < 1);
    assert.equal(Math.round(tlis * 3), 1);
  });
});

describe('computeGNCI', () => {
  test('empty graph returns 0', () => {
    assert.equal(computeGNCI(new DirectedGraph()), 0);
  });

  test('all-zero degree returns 0', () => {
    const G = new DirectedGraph();
    G.addNode('a', {}); G.addNode('b', {});
    assert.equal(computeGNCI(G), 0);
  });

  test('uniform degree returns 1', () => {
    const G = new DirectedGraph();
    for (const id of ['a', 'b', 'c', 'd']) G.addNode(id, {});
    G.addEdge('a', 'b', {}); G.addEdge('b', 'c', {});
    G.addEdge('c', 'd', {}); G.addEdge('d', 'a', {});
    assert.equal(computeGNCI(G), 1);
  });

  test('star graph has GNCI > 1', () => {
    const G = new DirectedGraph();
    G.addNode('hub', {});
    for (let i = 0; i < 9; i++) {
      G.addNode(`s${i}`, {});
      G.addEdge('hub', `s${i}`, {});
    }
    assert.ok(computeGNCI(G) > 1);
  });
});

describe('computeCFI', () => {
  test('no communities returns 0', () => {
    assert.equal(computeCFI({ communities: new Map() }), 0);
  });

  test('all named communities returns 1', () => {
    const comm = makeCommunities([
      { label: 'retrieval', nodes: ['a'] },
      { label: 'database', nodes: ['b'] },
    ]);
    assert.equal(computeCFI({ communities: comm }), 1);
  });

  test('all unnamed returns community count', () => {
    const comm = makeCommunities([
      { label: null, nodes: ['a'] },
      { label: null, nodes: ['b'] },
    ]);
    assert.equal(computeCFI({ communities: comm }), 2);
  });

  test('mixed named/unnamed increases CFI above 1', () => {
    const comm = makeCommunities([
      { label: 'retrieval', nodes: ['a'] },
      { label: null, nodes: ['b'] },
      { label: null, nodes: ['c'] },
    ]);
    assert.ok(computeCFI({ communities: comm }) > 1);
  });
});

describe('computeRScore', () => {
  test('healthy graph scores near 1', () => {
    // TLIS=0, GNCI small, CFI=1 (all named)
    const r = computeRScore(0, 5, 1);
    assert.ok(r > 0.7);
  });

  test('max-risk graph scores low', () => {
    const r = computeRScore(1, 1000, 1000);
    assert.ok(r < 0.1);
  });

  test('never below 0', () => {
    assert.ok(computeRScore(1, 1000, 1000) >= 0);
  });

  test('at thresholds scores around 0.5', () => {
    // TLIS=0.5, GNCI=20 → normGNCI=0.5, CFI=10 → normCFI=0.5
    const r = computeRScore(0.5, 20, 10);
    assert.ok(r >= 0.4 && r <= 0.6);
  });
});

describe('routingRisk', () => {
  test('rscore >= 0.7 → LOW', () => {
    assert.equal(routingRisk(0.8), 'LOW');
    assert.equal(routingRisk(0.7), 'LOW');
  });

  test('rscore 0.4–0.69 → MEDIUM', () => {
    assert.equal(routingRisk(0.5), 'MEDIUM');
    assert.equal(routingRisk(0.4), 'MEDIUM');
  });

  test('rscore < 0.4 → HIGH', () => {
    assert.equal(routingRisk(0.2), 'HIGH');
    assert.equal(routingRisk(0), 'HIGH');
  });
});

describe('failureModes', () => {
  test('healthy graph has no failure modes', () => {
    assert.deepEqual(failureModes(0.1, 5, 3), []);
  });

  test('TLIS >= 0.5 → Isolation Deadlock', () => {
    assert.ok(failureModes(0.6, 5, 3).some((m) => m.includes('Isolation Deadlock')));
  });

  test('GNCI >= 20 → Coupling Lock', () => {
    assert.ok(failureModes(0.1, 25, 3).some((m) => m.includes('Coupling Lock')));
  });

  test('CFI >= 10 → Fragmentation Collapse', () => {
    assert.ok(failureModes(0.1, 5, 15).some((m) => m.includes('Fragmentation Collapse')));
  });

  test('all three failure modes detected', () => {
    assert.equal(failureModes(0.8, 51, 41).length, 3);
  });
});
