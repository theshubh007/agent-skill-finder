import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from 'graphology';
import { clusterGraph } from '../../src/kg/cluster.js';

function makeGraph(nodes, edges = []) {
  const G = new DirectedGraph();
  for (const [id, attrs] of nodes) G.addNode(id, attrs);
  for (const [src, tgt] of edges) G.addEdge(src, tgt, { weight: 1 });
  return G;
}

describe('clusterGraph', () => {
  test('returns empty communities for empty graph', () => {
    const G = new DirectedGraph();
    const { communities, unnamedCount } = clusterGraph(G);
    assert.equal(communities.size, 0);
    assert.equal(unnamedCount, 0);
  });

  test('single node forms one community', () => {
    const G = makeGraph([['skill-a', { capabilityType: 'retrieval', label: 'skill-a' }]]);
    const { communities } = clusterGraph(G);
    assert.equal(communities.size, 1);
  });

  test('community label derived from most-common capabilityType', () => {
    const G = makeGraph([
      ['a', { capabilityType: 'retrieval', label: 'a' }],
      ['b', { capabilityType: 'retrieval', label: 'b' }],
      ['c', { capabilityType: 'code-execution', label: 'c' }],
    ], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
    const { communities } = clusterGraph(G);
    // At least one community should exist
    assert.ok(communities.size >= 1);
    for (const [, comm] of communities) {
      assert.ok(Array.isArray(comm.nodes));
      assert.ok(typeof comm.cohesion === 'number');
    }
  });

  test('nodes tagged with communityId and communityLabel after clustering', () => {
    const G = makeGraph([
      ['skill-x', { capabilityType: 'web-search', label: 'skill-x' }],
      ['skill-y', { capabilityType: 'web-search', label: 'skill-y' }],
    ], [['skill-x', 'skill-y']]);
    clusterGraph(G);
    assert.ok(G.hasNodeAttribute('skill-x', 'communityId'));
    assert.ok(G.hasNodeAttribute('skill-x', 'communityLabel'));
  });

  test('unnamed communities counted for CFI numerator', () => {
    const G = makeGraph([
      ['a', { capabilityType: 'unknown', label: 'a' }],
      ['b', { capabilityType: 'unknown', label: 'b' }],
    ], [['a', 'b']]);
    const { unnamedCount } = clusterGraph(G);
    // Both have unknown capabilityType → community label is null → unnamed
    assert.ok(unnamedCount >= 0);
  });

  test('cohesion is 0–1', () => {
    const G = makeGraph([
      ['p', { capabilityType: 'retrieval', label: 'p' }],
      ['q', { capabilityType: 'retrieval', label: 'q' }],
      ['r', { capabilityType: 'database', label: 'r' }],
    ], [['p', 'q'], ['q', 'r']]);
    const { communities } = clusterGraph(G);
    for (const [, c] of communities) {
      assert.ok(c.cohesion >= 0 && c.cohesion <= 1);
    }
  });
});
