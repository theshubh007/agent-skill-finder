import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  signalDescriptionTemplate,
  signalNameCollision,
  signalGraphIsolation,
  signalAstDuplicate,
  signalEmptyContent,
  computeSlopScore,
  QUARANTINE_THRESHOLD,
  BOILERPLATE_PATTERNS,
} from '../src/slopGate.js';

describe('signalDescriptionTemplate', () => {
  test('original description scores 1', () => {
    assert.equal(signalDescriptionTemplate('Parses genomics VCF files and returns structured variants'), 1.0);
  });

  test('boilerplate phrase lowers score', () => {
    assert.ok(signalDescriptionTemplate('This tool helps you streamline your workflow') < 1);
  });

  test('pure boilerplate scores 0', () => {
    const score = signalDescriptionTemplate(
      'This tool helps you with tasks. Leverages state-of-the-art AI. Comprehensive solution. Powerful tool.',
    );
    assert.equal(score, 0);
  });

  test('antigravity template pattern scores 0', () => {
    assert.ok(
      signalDescriptionTemplate('Use when working with debugging toolkit') < 1,
    );
  });
});

describe('signalNameCollision', () => {
  test('unique name scores 1', () => {
    assert.equal(signalNameCollision('vcf-parser', ['read-file', 'web-search']), 1);
  });

  test('exact match scores 0', () => {
    assert.equal(signalNameCollision('parse-args', ['parse-args', 'web-search']), 0);
  });

  test('edit-distance ≤ 2 scores 0', () => {
    // 'parseargs' vs 'parsearg' → distance 1
    assert.equal(signalNameCollision('parse-arg', ['parse-args']), 0);
  });

  test('hyphen normalisation: parse-args vs parse_args → collision', () => {
    assert.equal(signalNameCollision('parse_args', ['parse-args']), 0);
  });

  test('clearly different name scores 1', () => {
    assert.equal(signalNameCollision('genomics-vcf-annotator', ['web-search', 'database-query']), 1);
  });
});

describe('signalGraphIsolation', () => {
  test('degree 0 → 0 (isolated)', () => {
    assert.equal(signalGraphIsolation(0), 0);
  });

  test('degree 1 → 0 (barely connected)', () => {
    assert.equal(signalGraphIsolation(1), 0);
  });

  test('degree 2 → 1 (connected)', () => {
    assert.equal(signalGraphIsolation(2), 1);
  });

  test('degree 10 → 1 (well connected)', () => {
    assert.equal(signalGraphIsolation(10), 1);
  });
});

describe('signalAstDuplicate', () => {
  test('null hash → 1 (cannot check)', () => {
    assert.equal(signalAstDuplicate(null, new Set(['abc'])), 1);
  });

  test('hash not in canonical set → 1 (unique)', () => {
    assert.equal(signalAstDuplicate('abc123', new Set(['def456'])), 1);
  });

  test('hash in canonical set → 0 (duplicate)', () => {
    assert.equal(signalAstDuplicate('abc123', new Set(['abc123'])), 0);
  });
});

describe('signalEmptyContent', () => {
  test('no scripts → 0', () => {
    assert.equal(signalEmptyContent(false), 0);
  });

  test('has scripts but 0 executable lines → 0.5', () => {
    assert.equal(signalEmptyContent(true, 0), 0.5);
  });

  test('has scripts with executable lines → 1', () => {
    assert.equal(signalEmptyContent(true, 50), 1.0);
  });
});

describe('computeSlopScore', () => {
  test('all-good inputs score near 1', () => {
    const { slopScore } = computeSlopScore({
      descriptionUniqueness: 1.0,
      graphDegree: 5,
      description: 'Parses VCF files and outputs structured variant data',
      name: 'vcf-parser',
      canonicalNames: ['read-file', 'web-search'],
      scriptHash: 'abc123',
      canonicalHashes: new Set(['def456']),
      hasScripts: true,
      executableLines: 80,
    });
    assert.ok(slopScore > 0.9);
  });

  test('all-bad inputs score 0', () => {
    const { slopScore } = computeSlopScore({
      descriptionUniqueness: 0.0,
      graphDegree: 0,
      description: 'This tool helps you. Leverages cutting-edge AI. Comprehensive solution. Powerful tool.',
      name: 'parse-args',
      canonicalNames: ['parse-args'],
      scriptHash: 'known-hash',
      canonicalHashes: new Set(['known-hash']),
      hasScripts: false,
      executableLines: 0,
    });
    assert.equal(slopScore, 0);
  });

  test('score < QUARANTINE_THRESHOLD → quarantined=true', () => {
    const { slopScore, quarantined } = computeSlopScore({
      graphDegree: 0,
      description: 'This tool helps you with everything. Best-in-class user-friendly solution.',
      hasScripts: false,
    });
    assert.ok(slopScore < QUARANTINE_THRESHOLD);
    assert.equal(quarantined, true);
  });

  test('returns all 6 signal keys', () => {
    const { signals } = computeSlopScore();
    const keys = Object.keys(signals).sort();
    assert.deepEqual(keys, [
      'ast_duplicate',
      'description_template',
      'description_uniqueness',
      'empty_content',
      'graph_isolation',
      'name_collision',
    ]);
  });

  test('QUARANTINE_THRESHOLD is 0.4', () => {
    assert.equal(QUARANTINE_THRESHOLD, 0.4);
  });

  test('antigravity boilerplate skill → quarantined', () => {
    // descriptionUniqueness 0.2 reflects high SBERT similarity to other boilerplate skills
    const { quarantined } = computeSlopScore({
      descriptionUniqueness: 0.2,
      description: 'Use when working with debugging toolkit smart debug. Needing guidance, best practices, or checklists for debugging.',
      graphDegree: 0,
      hasScripts: false,
    });
    assert.equal(quarantined, true);
  });

  test('BOILERPLATE_PATTERNS is exported and non-empty', () => {
    assert.ok(Array.isArray(BOILERPLATE_PATTERNS));
    assert.ok(BOILERPLATE_PATTERNS.length > 0);
  });
});
