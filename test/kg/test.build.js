import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../../src/kg/build.js';

function makeManifest(id, overrides = {}) {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: `${id} does something useful for testing`,
    capability: { type: 'retrieval', inputs: [], outputs: [] },
    graph: { depends_on: [], complements: [], co_used_with: [] },
    compatibility: { claude_code: false, gemini: false, codex: false, cursor: false, mcp: false },
    risk: 'safe',
    source: { registry: 'test', path: `/${id}.js` },
    quality: { slop_score: 0.8, description_uniqueness: 0.9, is_duplicate: false },
    ...overrides,
  };
}

describe('buildGraph', () => {
  test('returns a DirectedGraph with manifest nodes', () => {
    const G = buildGraph([makeManifest('skill-a'), makeManifest('skill-b')]);
    assert.ok(G.hasNode('skill-a'));
    assert.ok(G.hasNode('skill-b'));
    assert.equal(G.order, 2);
  });

  test('node attributes populated from manifest', () => {
    const G = buildGraph([makeManifest('skill-a')]);
    const attrs = G.getNodeAttributes('skill-a');
    assert.equal(attrs.capabilityType, 'retrieval');
    assert.equal(attrs.riskTier, 'safe');
    assert.equal(attrs.slopScore, 0.8);
    assert.equal(attrs.canonicalId, 'skill-a');
    assert.ok(attrs.manifestText.includes('skill-a'));
  });

  test('manifest depends_on → EXTRACTED directed edge', () => {
    const m = makeManifest('skill-a', { graph: { depends_on: ['skill-b'], complements: [], co_used_with: [] } });
    const G = buildGraph([m, makeManifest('skill-b')]);
    assert.ok(G.hasEdge('skill-a', 'skill-b'));
    const attrs = G.getEdgeAttributes('skill-a', 'skill-b');
    assert.equal(attrs.relation, 'depends_on');
    assert.equal(attrs.confidence, 'EXTRACTED');
  });

  test('extraction edges added when nodes exist', () => {
    const manifests = [makeManifest('skill-a'), makeManifest('skill-b')];
    const extractions = [{
      nodes: [],
      edges: [{
        source: 'skill-a', target: 'skill-b',
        relation: 'complements',
        confidence: 'INFERRED',
        confidence_score: 0.7,
        source_file: '/skill-a.js',
        source_location: 'L5',
        weight: 0.7,
      }],
    }];
    const G = buildGraph(manifests, extractions);
    assert.ok(G.hasEdge('skill-a', 'skill-b'));
    const attrs = G.getEdgeAttributes('skill-a', 'skill-b');
    assert.equal(attrs.confidence, 'INFERRED');
  });

  test('EXTRACTED beats INFERRED for same (src, tgt, relation)', () => {
    const manifests = [makeManifest('skill-a'), makeManifest('skill-b')];
    const extractions = [
      {
        nodes: [],
        edges: [{
          source: 'skill-a', target: 'skill-b', relation: 'depends_on',
          confidence: 'AMBIGUOUS', confidence_score: 0.3,
          source_file: '', source_location: '', weight: 0.3,
        }],
      },
      {
        nodes: [],
        edges: [{
          source: 'skill-a', target: 'skill-b', relation: 'depends_on',
          confidence: 'EXTRACTED', confidence_score: 1.0,
          source_file: '', source_location: '', weight: 1.0,
        }],
      },
    ];
    const G = buildGraph(manifests, extractions);
    const attrs = G.getEdgeAttributes('skill-a', 'skill-b');
    assert.equal(attrs.confidence, 'EXTRACTED');
  });

  test('edges to unknown nodes are skipped', () => {
    const manifests = [makeManifest('skill-a')];
    const extractions = [{
      nodes: [],
      edges: [{
        source: 'skill-a', target: 'nonexistent-skill',
        relation: 'depends_on', confidence: 'EXTRACTED',
        confidence_score: 1.0, source_file: '', source_location: '', weight: 1.0,
      }],
    }];
    const G = buildGraph(manifests, extractions);
    assert.equal(G.size, 0);
  });

  test('handles empty manifests and extractions', () => {
    const G = buildGraph([], []);
    assert.equal(G.order, 0);
    assert.equal(G.size, 0);
  });
});
