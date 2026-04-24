import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractMd } from '../../src/kg/extractMd.js';

const TMP = tmpdir();

function writeTmp(name, content) {
  const p = join(TMP, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

describe('extractMd — frontmatter extraction', () => {
  test('returns file node for minimal SKILL.md', () => {
    const p = writeTmp('asf_test_minimal.md', '# My Skill\nDoes something.\n');
    const { nodes, edges } = extractMd(p);
    assert.ok(nodes.length >= 1);
    assert.equal(nodes[0].file_type, 'skill');
    assert.equal(edges.length, 0);
    unlinkSync(p);
  });

  test('extracts depends_on frontmatter → EXTRACTED edge', () => {
    const p = writeTmp('asf_test_deps.md', `---
depends_on:
  - search-papers
  - fetch-dataset
---
# My Skill
`);
    const { edges } = extractMd(p);
    const extracted = edges.filter(e => e.confidence === 'EXTRACTED' && e.relation === 'depends_on');
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].confidence_score, 1.0);
    assert.equal(extracted[0].weight, 1.0);
    unlinkSync(p);
  });

  test('extracts complements frontmatter → EXTRACTED edge', () => {
    const p = writeTmp('asf_test_comp.md', `---
complements: citation-verifier
---
# Skill
`);
    const { edges } = extractMd(p);
    const comp = edges.filter(e => e.relation === 'complements' && e.confidence === 'EXTRACTED');
    assert.equal(comp.length, 1);
    unlinkSync(p);
  });

  test('extracts ## Required section → INFERRED edges at 0.7', () => {
    const p = writeTmp('asf_test_required.md', `---
---
# My Skill

## Required

- search-index
- fetch-url
`);
    const { edges } = extractMd(p);
    const inferred = edges.filter(e => e.confidence === 'INFERRED');
    assert.ok(inferred.length >= 1);
    assert.equal(inferred[0].confidence_score, 0.7);
    assert.equal(inferred[0].relation, 'depends_on');
    unlinkSync(p);
  });

  test('extracts ## References section → rationale nodes', () => {
    const p = writeTmp('asf_test_refs.md', `---
---
# My Skill

## References

- SkillRouter arXiv 2603.22455
- SkillFlow arXiv 2504.06188
`);
    const { nodes, edges } = extractMd(p);
    const refNodes = nodes.filter(n => n.file_type === 'rationale');
    assert.ok(refNodes.length >= 2);
    const ambiguous = edges.filter(e => e.confidence === 'AMBIGUOUS');
    assert.ok(ambiguous.length >= 2);
    unlinkSync(p);
  });

  test('handles missing file gracefully', () => {
    const { nodes, edges } = extractMd('/tmp/asf_nonexistent_skill_xyz.md');
    assert.ok(Array.isArray(nodes));
    assert.ok(Array.isArray(edges));
    assert.equal(nodes[0].file_type, 'skill');
  });

  test('handles SKILL.md with no frontmatter separator', () => {
    const p = writeTmp('asf_test_nofm.md', '# Plain\nNo frontmatter here.\n');
    const { nodes, edges } = extractMd(p);
    assert.ok(nodes.length >= 1);
    assert.equal(edges.length, 0);
    unlinkSync(p);
  });
});
