import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadAntigravitySkills } from '../../src/adapters/antigravity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve to the sibling registry dir two levels up from agent-skill-finder
const REGISTRY_ROOT = join(__dirname, '..', '..', '..', 'antigravity-awesome-skills');
const SKIP = !existsSync(REGISTRY_ROOT);

describe('antigravity adapter', { skip: SKIP ? 'sibling registry not present' : false }, () => {
  test('loads skills from real registry without throwing', async () => {
    const manifests = await loadAntigravitySkills(REGISTRY_ROOT);
    assert.ok(manifests.length > 0, 'expected at least one skill');
  });

  test('every manifest passes schema validation', async () => {
    const manifests = await loadAntigravitySkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.ok(typeof m.id === 'string' && m.id.length > 0, `invalid id: ${m.id}`);
      assert.ok(typeof m.description === 'string', `missing description on ${m.id}`);
      assert.ok(m.source.registry === 'antigravity-awesome-skills', `wrong registry on ${m.id}`);
      assert.ok(['safe', 'network', 'exec', 'critical', 'unsafe'].includes(m.risk),
        `invalid risk tier "${m.risk}" on ${m.id}`);
    }
  });

  test('loads at least 1000 skills from full registry', async () => {
    const manifests = await loadAntigravitySkills(REGISTRY_ROOT);
    assert.ok(manifests.length >= 1000,
      `expected >= 1000 skills, got ${manifests.length}`);
  });

  test('risk tier maps correctly', async () => {
    const manifests = await loadAntigravitySkills(REGISTRY_ROOT);
    const validTiers = new Set(['safe', 'network', 'exec', 'critical', 'unsafe']);
    for (const m of manifests) {
      assert.ok(validTiers.has(m.risk), `invalid risk tier "${m.risk}" on ${m.id}`);
    }
  });

  test('compatibility defaults to claude_code=true, mcp=true', async () => {
    const manifests = await loadAntigravitySkills(REGISTRY_ROOT);
    const sample = manifests[0];
    assert.equal(sample.compatibility.claude_code, true);
    assert.equal(sample.compatibility.mcp, true);
  });

  test('capability type is a recognized enum value', async () => {
    const validTypes = new Set([
      'retrieval', 'code-execution', 'file-io', 'web-search', 'data-transform',
      'visualization', 'bioinformatics', 'report-writing', 'communication',
      'database', 'security', 'devops', 'ml-inference', 'planning',
    ]);
    const manifests = await loadAntigravitySkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.ok(validTypes.has(m.capability.type),
        `unknown capability type "${m.capability.type}" on ${m.id}`);
    }
  });
});
