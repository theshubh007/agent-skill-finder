import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from 'graphology';
import { expandSubgraph } from '../../src/kg/walk.js';

function makeGraph(nodes, edges = []) {
  const G = new DirectedGraph();
  for (const [id, attrs] of nodes) G.addNode(id, { label: id, ...attrs });
  for (const [src, tgt, rel] of edges) G.addEdge(src, tgt, { relation: rel, weight: 1 });
  return G;
}

describe('expandSubgraph', () => {
  test('empty graph returns empty', () => {
    const { nodes, edges } = expandSubgraph(new DirectedGraph(), ['a']);
    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
  });

  test('empty seeds returns empty', () => {
    const G = makeGraph([['a', {}]]);
    const { nodes } = expandSubgraph(G, []);
    assert.equal(nodes.length, 0);
  });

  test('seed not in graph is ignored', () => {
    const G = makeGraph([['a', {}]]);
    const { nodes } = expandSubgraph(G, ['nonexistent']);
    assert.equal(nodes.length, 0);
  });

  test('seed with no edges returns just seed', () => {
    const G = makeGraph([['a', {}]]);
    const { nodes, edges } = expandSubgraph(G, ['a']);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0], 'a');
    assert.equal(edges.length, 0);
  });

  test('traverses depends_on edges', () => {
    const G = makeGraph(
      [['a', {}], ['b', {}], ['c', {}]],
      [['a', 'b', 'depends_on'], ['b', 'c', 'depends_on']],
    );
    const { nodes, edges } = expandSubgraph(G, ['a']);
    assert.deepEqual([...nodes].sort(), ['a', 'b', 'c']);
    assert.equal(edges.length, 2);
  });

  test('traverses complements and co_used_with edges', () => {
    const G = makeGraph(
      [['a', {}], ['b', {}], ['c', {}]],
      [['a', 'b', 'complements'], ['a', 'c', 'co_used_with']],
    );
    const { nodes } = expandSubgraph(G, ['a']);
    assert.ok(nodes.includes('b'));
    assert.ok(nodes.includes('c'));
  });

  test('ignores non-traversal edge types', () => {
    const G = makeGraph(
      [['a', {}], ['b', {}]],
      [['a', 'b', 'conflicts_with']],
    );
    const { nodes } = expandSubgraph(G, ['a']);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0], 'a');
  });

  test('custom edgeTypes restricts traversal', () => {
    const G = makeGraph(
      [['a', {}], ['b', {}], ['c', {}]],
      [['a', 'b', 'depends_on'], ['a', 'c', 'complements']],
    );
    const { nodes } = expandSubgraph(G, ['a'], { edgeTypes: ['depends_on'] });
    assert.ok(nodes.includes('b'));
    assert.ok(!nodes.includes('c'));
  });

  test('token budget limits traversal', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => [`n${i}`, {}]);
    const edges = Array.from({ length: 19 }, (_, i) => [`n${i}`, `n${i + 1}`, 'depends_on']);
    const G = makeGraph(nodes, edges);
    const { nodes: result } = expandSubgraph(G, ['n0'], { tokenBudget: 5 });
    assert.ok(result.length < 20);
    assert.ok(result.includes('n0'));
  });

  test('deduplication by canonicalId skips same-cid nodes', () => {
    const G = makeGraph(
      [
        ['a', {}],
        ['b', { canonicalId: 'cap-x' }],
        ['c', { canonicalId: 'cap-x' }],
      ],
      [['a', 'b', 'depends_on'], ['a', 'c', 'depends_on']],
    );
    const { nodes } = expandSubgraph(G, ['a'], { dedupeBy: 'canonicalId' });
    const bcCount = nodes.filter(n => n === 'b' || n === 'c').length;
    assert.equal(bcCount, 1);
  });

  test('dedupeBy null disables deduplication', () => {
    const G = makeGraph(
      [
        ['a', {}],
        ['b', { canonicalId: 'cap-x' }],
        ['c', { canonicalId: 'cap-x' }],
      ],
      [['a', 'b', 'depends_on'], ['a', 'c', 'depends_on']],
    );
    const { nodes } = expandSubgraph(G, ['a'], { dedupeBy: null });
    assert.ok(nodes.includes('b'));
    assert.ok(nodes.includes('c'));
  });

  test('slop filter skips low-slopScore nodes', () => {
    const G = makeGraph(
      [['a', {}], ['b', { slopScore: 0.2 }], ['c', { slopScore: 0.9 }]],
      [['a', 'b', 'depends_on'], ['a', 'c', 'depends_on']],
    );
    const { nodes } = expandSubgraph(G, ['a'], { slopFilter: 0.5 });
    assert.ok(!nodes.includes('b'));
    assert.ok(nodes.includes('c'));
  });

  test('edges include correct source, target, relation', () => {
    const G = makeGraph(
      [['a', {}], ['b', {}]],
      [['a', 'b', 'complements']],
    );
    const { edges } = expandSubgraph(G, ['a']);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].source, 'a');
    assert.equal(edges[0].target, 'b');
    assert.equal(edges[0].relation, 'complements');
  });
});
