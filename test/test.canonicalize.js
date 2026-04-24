import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, astHash, canonicalize } from '../src/canonicalize.js';

function makeManifest(id, description, slopScore = 1.0, scriptContent = null) {
  return {
    id,
    description,
    quality: { slop_score: slopScore },
    source: { registry: 'test', path: `skills/${id}/SKILL.md` },
    canonicalId: null,
    _scriptContent: scriptContent,
  };
}

describe('cosineSimilarity', () => {
  test('identical vectors → 1', () => {
    const v = [1, 0, 1, 0];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
  });

  test('orthogonal vectors → 0', () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  test('opposite vectors → -1', () => {
    assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  });

  test('zero vector → 0', () => {
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  });

  test('partial overlap < 1', () => {
    const sim = cosineSimilarity([1, 1, 0], [1, 0, 1]);
    assert.ok(sim > 0 && sim < 1);
  });
});

describe('astHash', () => {
  test('returns 16-char hex string', () => {
    assert.match(astHash('const x = 1;'), /^[0-9a-f]{16}$/);
  });

  test('same content → same hash', () => {
    assert.equal(astHash('function foo() {}'), astHash('function foo() {}'));
  });

  test('different content → different hash', () => {
    assert.notEqual(astHash('function foo() {}'), astHash('function bar() {}'));
  });

  test('extra whitespace between tokens → same hash', () => {
    assert.equal(astHash('const  x  =  1'), astHash('const x = 1'));
  });

  test('comment-stripped → same hash', () => {
    assert.equal(
      astHash('const x = 1; // comment'),
      astHash('const x = 1;'),
    );
  });

  test('block-comment-stripped → same hash', () => {
    assert.equal(
      astHash('/* block */ const x = 1;'),
      astHash('const x = 1;'),
    );
  });
});

describe('canonicalize — AST hash dedup', () => {
  test('no duplicates → all canonical', () => {
    const manifests = [
      makeManifest('a', 'desc a', 1.0, 'const a = 1;'),
      makeManifest('b', 'desc b', 1.0, 'const b = 2;'),
    ];
    const scripts = new Map([['a', 'const a = 1;'], ['b', 'const b = 2;']]);
    const { duplicateEdges, canonicalCount, rawCount } = canonicalize(manifests, { scriptContents: scripts });
    assert.equal(duplicateEdges.length, 0);
    assert.equal(canonicalCount, 2);
    assert.equal(rawCount, 2);
  });

  test('structural duplicate → duplicate_of edge (EXTRACTED)', () => {
    const src = 'function parse_args(args) { return args; }';
    const manifests = [
      makeManifest('parse-args-v1', 'parse CLI args', 0.8, src),
      makeManifest('parse-args-v2', 'parse command args', 0.5, src),
    ];
    const scripts = new Map([['parse-args-v1', src], ['parse-args-v2', src]]);
    const { duplicateEdges } = canonicalize(manifests, { scriptContents: scripts });
    assert.equal(duplicateEdges.length, 1);
    assert.equal(duplicateEdges[0].relation, 'duplicate_of');
    assert.equal(duplicateEdges[0].confidence, 'EXTRACTED');
    assert.equal(duplicateEdges[0].confidence_score, 1.0);
  });

  test('higher slop_score wins canonical selection', () => {
    const src = 'class DOCXSchemaValidator {}';
    const manifests = [
      makeManifest('docx-v1', 'validate DOCX', 0.5, src),
      makeManifest('docx-v2', 'validate DOCX schema', 0.9, src),
    ];
    const scripts = new Map([['docx-v1', src], ['docx-v2', src]]);
    const { duplicateEdges } = canonicalize(manifests, { scriptContents: scripts });
    assert.equal(duplicateEdges[0].source, 'docx-v1');
    assert.equal(duplicateEdges[0].target, 'docx-v2');
  });

  test('canonicalId assigned to all manifests', () => {
    const src = 'const x = 1;';
    const manifests = [
      makeManifest('x-a', 'desc a', 0.9, src),
      makeManifest('x-b', 'desc b', 0.5, src),
    ];
    const scripts = new Map([['x-a', src], ['x-b', src]]);
    canonicalize(manifests, { scriptContents: scripts });
    assert.equal(manifests[0].canonicalId, 'x-a');
    assert.equal(manifests[1].canonicalId, 'x-a');
  });

  test('dedupePercent computed correctly', () => {
    const src = 'const dup = true;';
    const manifests = [
      makeManifest('a', 'desc', 1.0, src),
      makeManifest('b', 'desc', 0.5, src),
    ];
    const scripts = new Map([['a', src], ['b', src]]);
    const { rawCount, canonicalCount, dedupePercent } = canonicalize(manifests, { scriptContents: scripts });
    assert.equal(rawCount, 2);
    assert.equal(canonicalCount, 1);
    assert.equal(dedupePercent, 50);
  });
});

describe('canonicalize — cosine similarity dedup', () => {
  test('similar embeddings → duplicate_of edge (INFERRED)', () => {
    const manifests = [
      makeManifest('skill-a', 'fetch web page content'),
      makeManifest('skill-b', 'retrieve web page content'),
    ];
    // Near-identical vectors → high cosine similarity
    const embeddings = new Map([
      ['skill-a', [0.9, 0.1, 0.0]],
      ['skill-b', [0.88, 0.12, 0.0]],
    ]);
    const { duplicateEdges } = canonicalize(manifests, {
      embeddings,
      cosineThreshold: 0.97,
    });
    assert.equal(duplicateEdges.length, 1);
    assert.equal(duplicateEdges[0].confidence, 'INFERRED');
    assert.ok(duplicateEdges[0].confidence_score >= 0.97);
  });

  test('dissimilar embeddings → no edge', () => {
    const manifests = [
      makeManifest('skill-a', 'fetch web page'),
      makeManifest('skill-b', 'run database query'),
    ];
    const embeddings = new Map([
      ['skill-a', [1, 0, 0]],
      ['skill-b', [0, 1, 0]],
    ]);
    const { duplicateEdges } = canonicalize(manifests, { embeddings, cosineThreshold: 0.97 });
    assert.equal(duplicateEdges.length, 0);
  });
});

describe('canonicalize — transitive chains', () => {
  test('A→B→C resolves to A→C', () => {
    const src1 = 'const a = 1;';
    const src2 = 'const a = 1;';
    const src3 = 'const a = 1;';
    const manifests = [
      makeManifest('top', 'desc', 1.0, src1),
      makeManifest('mid', 'desc', 0.7, src2),
      makeManifest('bot', 'desc', 0.3, src3),
    ];
    const scripts = new Map([['top', src1], ['mid', src2], ['bot', src3]]);
    canonicalize(manifests, { scriptContents: scripts });
    // All should point to 'top'
    assert.equal(manifests[0].canonicalId, 'top');
    assert.equal(manifests[1].canonicalId, 'top');
    assert.equal(manifests[2].canonicalId, 'top');
  });
});

describe('canonicalize — empty input', () => {
  test('empty manifests list', () => {
    const { rawCount, canonicalCount, dedupePercent } = canonicalize([]);
    assert.equal(rawCount, 0);
    assert.equal(canonicalCount, 0);
    assert.equal(dedupePercent, 0);
  });
});
