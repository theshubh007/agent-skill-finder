import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClaudeSkills } from '../../src/adapters/claude_skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = join(__dirname, '..', '..', '..', 'claude-skills');

describe('claude-skills adapter', () => {
  test('loads skills without throwing', async () => {
    const manifests = await loadClaudeSkills(REGISTRY_ROOT);
    assert.ok(manifests.length > 0, 'expected at least one skill');
  });

  test('loads at least 150 skills', async () => {
    const manifests = await loadClaudeSkills(REGISTRY_ROOT);
    assert.ok(manifests.length >= 150,
      `expected >= 150 skills, got ${manifests.length}`);
  });

  test('every manifest has valid id and description', async () => {
    const manifests = await loadClaudeSkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.ok(/^[a-z0-9-]+$/.test(m.id), `invalid id format: "${m.id}"`);
      assert.ok(m.description.length >= 10, `short description on ${m.id}`);
    }
  });

  test('source.registry is claude-skills on all manifests', async () => {
    const manifests = await loadClaudeSkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.equal(m.source.registry, 'claude-skills', `wrong registry on ${m.id}`);
    }
  });

  test('at least one skill has claude_code=true', async () => {
    const manifests = await loadClaudeSkills(REGISTRY_ROOT);
    const hasClaudeCode = manifests.some(m => m.compatibility.claude_code);
    assert.ok(hasClaudeCode, 'expected at least one claude_code compatible skill');
  });
});
