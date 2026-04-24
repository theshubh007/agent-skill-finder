import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAwesomeClaudeSkills } from '../../src/adapters/awesome_claude.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_ROOT = join(__dirname, '..', '..', '..', 'awesome-claude-skills');

describe('awesome-claude-skills adapter', () => {
  test('loads skills without throwing', async () => {
    const manifests = await loadAwesomeClaudeSkills(REGISTRY_ROOT);
    assert.ok(manifests.length > 0, 'expected at least one skill');
  });

  test('loads at least 600 skills (composio + regular)', async () => {
    const manifests = await loadAwesomeClaudeSkills(REGISTRY_ROOT);
    assert.ok(manifests.length >= 600,
      `expected >= 600 skills, got ${manifests.length}`);
  });

  test('composio skills have low description_uniqueness flagged', async () => {
    const manifests = await loadAwesomeClaudeSkills(REGISTRY_ROOT);
    const composio = manifests.filter(m => m.source.path.startsWith('composio-skills'));
    assert.ok(composio.length > 0, 'expected composio skills');
    for (const m of composio) {
      assert.ok(m.quality.description_uniqueness < 0.5,
        `composio skill ${m.id} should have low description_uniqueness`);
    }
  });

  test('composio skills are above quarantine threshold (slop_score >= 0.4)', async () => {
    const manifests = await loadAwesomeClaudeSkills(REGISTRY_ROOT);
    const composio = manifests.filter(m => m.source.path.startsWith('composio-skills'));
    for (const m of composio) {
      assert.ok(m.quality.slop_score >= 0.4,
        `composio skill ${m.id} slop_score=${m.quality.slop_score} below quarantine threshold`);
    }
  });

  test('regular skills have full quality score', async () => {
    const manifests = await loadAwesomeClaudeSkills(REGISTRY_ROOT);
    const regular = manifests.filter(m => !m.source.path.startsWith('composio-skills'));
    assert.ok(regular.length > 0, 'expected regular (non-composio) skills');
    for (const m of regular) {
      assert.equal(m.quality.slop_score, 1, `regular skill ${m.id} should have slop_score=1`);
    }
  });

  test('source registry is awesome-claude-skills on all manifests', async () => {
    const manifests = await loadAwesomeClaudeSkills(REGISTRY_ROOT);
    for (const m of manifests) {
      assert.equal(m.source.registry, 'awesome-claude-skills');
    }
  });
});
