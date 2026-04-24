/**
 * Fixture-based dedup tests — asserts canonicalize() produces the right
 * duplicate_of edges for all 12 confirmed cross-registry duplicate pairs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from '../src/canonicalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'known-duplicates.json'), 'utf8'),
);

function buildManifests(pair) {
  return pair.map((p) => ({
    id: p.id,
    description: `Description for ${p.id}`,
    quality: { slop_score: p.slop_score },
    source: { registry: p.registry, path: `skills/${p.id}/SKILL.md` },
    canonicalId: null,
  }));
}

describe('fixture: AST-hash duplicates', () => {
  const astPairs = fixtures.filter((f) => f.dedup_type === 'ast_hash');

  for (const fixture of astPairs) {
    test(`pair ${fixture.id}: ${fixture.note}`, () => {
      const manifests = buildManifests(fixture.pair);
      const scripts = new Map(
        fixture.pair.map((p) => [p.id, p.script]),
      );

      const { duplicateEdges } = canonicalize(manifests, { scriptContents: scripts });

      // At least one duplicate_of edge must exist
      assert.ok(duplicateEdges.length >= 1, 'expected at least one duplicate_of edge');

      // The lower-quality variant must point to expected_canonical
      const loser = fixture.pair.find((p) => p.id !== fixture.expected_canonical);
      const edge = duplicateEdges.find(
        (e) => e.source === loser.id && e.target === fixture.expected_canonical,
      );
      assert.ok(
        edge,
        `expected edge ${loser.id} → ${fixture.expected_canonical}, got: ${JSON.stringify(duplicateEdges)}`,
      );
      assert.equal(edge.confidence, 'EXTRACTED');
    });
  }
});

describe('fixture: cosine-similarity duplicates', () => {
  const cosinePairs = fixtures.filter((f) => f.dedup_type === 'cosine');

  for (const fixture of cosinePairs) {
    test(`pair ${fixture.id}: ${fixture.note}`, () => {
      const manifests = buildManifests(fixture.pair);
      const embeddings = new Map(
        fixture.pair.map((p) => [p.id, p.embedding]),
      );

      const { duplicateEdges } = canonicalize(manifests, {
        embeddings,
        cosineThreshold: 0.97,
      });

      assert.ok(duplicateEdges.length >= 1, 'expected at least one duplicate_of edge');

      const loser = fixture.pair.find((p) => p.id !== fixture.expected_canonical);
      const edge = duplicateEdges.find(
        (e) => e.source === loser.id && e.target === fixture.expected_canonical,
      );
      assert.ok(
        edge,
        `expected edge ${loser.id} → ${fixture.expected_canonical}`,
      );
      assert.equal(edge.confidence, 'INFERRED');
    });
  }
});

describe('fixture: canonical selection always picks highest slop_score', () => {
  for (const fixture of fixtures) {
    test(`pair ${fixture.id}: canonical = highest slop_score`, () => {
      const manifests = buildManifests(fixture.pair);
      const scripts = fixture.dedup_type === 'ast_hash'
        ? new Map(fixture.pair.map((p) => [p.id, p.script]))
        : null;
      const embeddings = fixture.dedup_type === 'cosine'
        ? new Map(fixture.pair.map((p) => [p.id, p.embedding]))
        : null;

      canonicalize(manifests, { scriptContents: scripts, embeddings, cosineThreshold: 0.97 });

      const canonical = manifests.find((m) => m.canonicalId === m.id);
      assert.ok(canonical, 'expected at least one node to be its own canonical');

      const maxSlop = Math.max(...fixture.pair.map((p) => p.slop_score));
      const expectedWinner = fixture.pair.find((p) => p.slop_score === maxSlop);
      assert.equal(
        canonical.id,
        expectedWinner.id,
        `canonical should be ${expectedWinner.id} (slop=${maxSlop})`,
      );
    });
  }
});
