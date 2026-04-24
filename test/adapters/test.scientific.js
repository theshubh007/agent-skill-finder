import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScientificSkills } from '../../src/adapters/scientific.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = join(__dirname, '..', '..', '..', 'scientific-agent-skills');

describe('scientific-agent-skills adapter', () => {
  test('loads skills without throwing', async () => {
    const manifests = await loadScientificSkills(REGISTRY_ROOT);
    assert.ok(manifests.length > 0, 'expected at least one skill');
  });

  test('loads at least 100 skills', async () => {
    const manifests = await loadScientificSkills(REGISTRY_ROOT);
    assert.ok(manifests.length >= 100,
      `expected >= 100 skills, got ${manifests.length}`);
  });

  test('capability types are bioinformatics-domain values', async () => {
    const validTypes = new Set([
      'bioinformatics', 'visualization', 'retrieval', 'report-writing',
      'data-transform', 'database', 'ml-inference',
    ]);
    const manifests = await loadScientificSkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.ok(validTypes.has(m.capability.type),
        `unexpected capability type "${m.capability.type}" on ${m.id}`);
    }
  });

  test('all skills have risk=safe', async () => {
    const manifests = await loadScientificSkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.equal(m.risk, 'safe', `expected safe risk on ${m.id}`);
    }
  });

  test('source registry is scientific-agent-skills', async () => {
    const manifests = await loadScientificSkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.equal(m.source.registry, 'scientific-agent-skills');
    }
  });
});
