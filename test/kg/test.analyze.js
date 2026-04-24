import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from 'graphology';
import { detectGodNodes, detectBridgeNodes, detectIsolatedTools, analyzeGraph } from '../../src/kg/analyze.js';

function starGraph(center, spokes) {
  const G = new DirectedGraph();
  G.addNode(center, { label: center });
  for (const s of spokes) {
    G.addNode(s, { label: s });
    G.addEdge(center, s, { weight: 1 });
  }
  return G;
}

describe('detectIsolatedTools', () => {
  test('returns isolated nodes', () => {
    const G = new DirectedGraph();
    G.addNode('lonely', { label: 'lonely' });
    G.addNode('connected', { label: 'connected' });
    G.addNode('other', { label: 'other' });
    G.addEdge('connected', 'other', {});
    const isolated = detectIsolatedTools(G);
    assert.equal(isolated.length, 1);
    assert.equal(isolated[0].id, 'lonely');
  });

  test('returns empty for fully connected graph', () => {
    const G = starGraph('hub', ['a', 'b', 'c']);
    assert.equal(detectIsolatedTools(G).length, 0);
  });

  test('handles empty graph', () => {
    assert.equal(detectIsolatedTools(new DirectedGraph()).length, 0);
  });
});

describe('detectGodNodes', () => {
  test('detects high-degree hub node', () => {
    // center connects to 10 spokes → degree 10; spokes have degree 1; mean = (10 + 10*1)/11 ≈ 1.8
    const G = starGraph('hub', ['a','b','c','d','e','f','g','h','i','j']);
    const gods = detectGodNodes(G, { threshold: 2.0 });
    assert.ok(gods.length >= 1);
    assert.equal(gods[0].id, 'hub');
    assert.ok(gods[0].ratio > 2);
  });

  test('returns empty for uniform-degree graph', () => {
    const G = new DirectedGraph();
    for (const id of ['a','b','c','d']) G.addNode(id, { label: id });
    G.addEdge('a','b',{}); G.addEdge('b','c',{}); G.addEdge('c','d',{}); G.addEdge('d','a',{});
    const gods = detectGodNodes(G, { threshold: 3.0 });
    assert.equal(gods.length, 0);
  });

  test('handles empty graph', () => {
    assert.equal(detectGodNodes(new DirectedGraph()).length, 0);
  });
});

describe('detectBridgeNodes', () => {
  test('detects bridge in chain graph', () => {
    const G = new DirectedGraph();
    for (const id of ['a','b','c','d','e']) G.addNode(id, { label: id });
    G.addEdge('a','b',{}); G.addEdge('b','c',{}); G.addEdge('c','d',{}); G.addEdge('d','e',{});
    const bridges = detectBridgeNodes(G);
    // Middle nodes should have higher betweenness
    assert.ok(bridges.length > 0);
    assert.ok(typeof bridges[0].betweenness === 'number');
  });

  test('handles empty graph', () => {
    assert.equal(detectBridgeNodes(new DirectedGraph()).length, 0);
  });
});

describe('analyzeGraph', () => {
  test('returns full report with stats', () => {
    const G = starGraph('hub', ['a','b','c','d','e','f','g','h','i','j']);
    const report = analyzeGraph(G);
    assert.ok(Array.isArray(report.godNodes));
    assert.ok(Array.isArray(report.bridgeNodes));
    assert.ok(Array.isArray(report.isolatedToolNodes));
    assert.equal(typeof report.stats.nodeCount, 'number');
    assert.equal(typeof report.stats.meanDegree, 'number');
    assert.equal(report.stats.nodeCount, 11);
    assert.equal(report.stats.edgeCount, 10);
  });

  test('isolated count matches TLIS numerator', () => {
    const G = new DirectedGraph();
    G.addNode('lonely', { label: 'lonely' });
    G.addNode('a', { label: 'a' });
    G.addNode('b', { label: 'b' });
    G.addEdge('a', 'b', {});
    const { stats } = analyzeGraph(G);
    assert.equal(stats.isolatedCount, 1);
  });
});
