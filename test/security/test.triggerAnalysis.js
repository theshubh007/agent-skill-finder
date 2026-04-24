import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTriggerPatterns,
  detectCrossRegistryOverlap,
  detectToolTweakInjection,
  analyzeRegistries,
} from '../../src/security/triggerAnalysis.js';

describe('extractTriggerPatterns', () => {
  test('detects network pattern', () => {
    const m = { description: 'fetch data from HTTP endpoint' };
    assert.ok(extractTriggerPatterns(m).includes('network'));
  });

  test('detects shell pattern', () => {
    const m = { description: 'execute bash command on host' };
    assert.ok(extractTriggerPatterns(m).includes('shell'));
  });

  test('detects multiple patterns', () => {
    const m = { description: 'fetch JSON from API and parse response' };
    const patterns = extractTriggerPatterns(m);
    assert.ok(patterns.includes('network'));
    assert.ok(patterns.includes('data'));
  });

  test('returns empty array for unrelated description', () => {
    const m = { description: 'greet the user with a welcome message' };
    assert.deepEqual(extractTriggerPatterns(m), []);
  });

  test('includes tags in analysis', () => {
    const m = { description: 'utility skill', tags: ['encrypt', 'key-management'] };
    assert.ok(extractTriggerPatterns(m).includes('crypto'));
  });

  test('null manifest returns empty array', () => {
    assert.deepEqual(extractTriggerPatterns(null), []);
  });
});

describe('detectCrossRegistryOverlap', () => {
  const skillsA = [
    { id: 'web-search', registry: 'reg-a', description: 'fetch results via HTTP API' },
  ];
  const skillsB = [
    { id: 'web-search-v2', registry: 'reg-b', description: 'HTTP fetch from search endpoint' },
    { id: 'file-reader',   registry: 'reg-b', description: 'read file from disk path' },
  ];

  test('finds overlap between same-category skills from different registries', () => {
    const overlaps = detectCrossRegistryOverlap(skillsA, skillsB);
    assert.ok(overlaps.length >= 1);
    const o = overlaps[0];
    assert.equal(o.skillA, 'web-search');
    assert.equal(o.skillB, 'web-search-v2');
    assert.notEqual(o.registryA, o.registryB);
    assert.ok(o.sharedPatterns.includes('network'));
  });

  test('no overlap between unrelated skills', () => {
    const overlaps = detectCrossRegistryOverlap(skillsA, [skillsB[1]]);
    assert.equal(overlaps.length, 0);
  });

  test('HIGH risk when 2+ shared patterns', () => {
    const a = [{ id: 'a', registry: 'r1', description: 'parse JSON file from disk' }];
    const b = [{ id: 'b', registry: 'r2', description: 'read file and parse JSON data' }];
    const overlaps = detectCrossRegistryOverlap(a, b);
    const high = overlaps.filter((o) => o.risk === 'HIGH');
    assert.ok(high.length >= 1);
  });

  test('same registry skills are skipped', () => {
    const a = [{ id: 'a', registry: 'same', description: 'HTTP fetch API' }];
    const b = [{ id: 'b', registry: 'same', description: 'HTTP fetch endpoint' }];
    assert.deepEqual(detectCrossRegistryOverlap(a, b), []);
  });
});

describe('detectToolTweakInjection', () => {
  test('flags skill with unexpected patterns', () => {
    const skills = [
      { id: 'web-search-v2', registry: 'reg-b', description: 'web search that also reads local files' },
    ];
    const categoryMap = new Map([['web-search-v2', ['network']]]);
    const flags = detectToolTweakInjection(skills, categoryMap);
    assert.equal(flags.length, 1);
    assert.equal(flags[0].skillId, 'web-search-v2');
    assert.ok(flags[0].unexpectedPatterns.includes('filesystem'));
    assert.equal(flags[0].injectionRisk, 'HIGH');
  });

  test('no flags when patterns match expected categories', () => {
    const skills = [
      { id: 'http-fetch', registry: 'reg-a', description: 'fetch data from HTTP API endpoint' },
    ];
    const categoryMap = new Map([['http-fetch', ['network']]]);
    assert.deepEqual(detectToolTweakInjection(skills, categoryMap), []);
  });

  test('no flags for skill with no trigger patterns', () => {
    const skills = [{ id: 'greeter', registry: 'r', description: 'say hello' }];
    const categoryMap = new Map();
    assert.deepEqual(detectToolTweakInjection(skills, categoryMap), []);
  });
});

describe('analyzeRegistries', () => {
  test('summary totals match overlaps array length', () => {
    const registries = [
      { name: 'reg-a', skills: [{ id: 'a', description: 'HTTP API fetch' }] },
      { name: 'reg-b', skills: [{ id: 'b', description: 'fetch from REST endpoint' }] },
    ];
    const { overlaps, summary } = analyzeRegistries(registries);
    assert.equal(overlaps.length, summary.total);
    assert.equal(summary.high + summary.medium, summary.total);
  });

  test('single registry produces no overlaps', () => {
    const { summary } = analyzeRegistries([
      { name: 'only', skills: [{ id: 'x', description: 'HTTP fetch' }] },
    ]);
    assert.equal(summary.total, 0);
  });

  test('empty registries returns zero overlaps', () => {
    const { summary } = analyzeRegistries([]);
    assert.equal(summary.total, 0);
  });
});
