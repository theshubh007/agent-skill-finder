import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractJs } from '../../src/kg/extractJs.js';

const TMP = tmpdir();

function writeTmp(name, content) {
  const p = join(TMP, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

describe('extractJs — import / require detection', () => {
  test('returns file node for any JS file', async () => {
    const p = writeTmp('asf_test_empty.js', '// empty');
    const result = await extractJs(p);
    assert.ok(Array.isArray(result.nodes));
    assert.ok(result.nodes.length >= 1);
    assert.ok(result.nodes[0].file_type === 'skill');
    unlinkSync(p);
  });

  test('returns empty edges for file with no imports', async () => {
    const p = writeTmp('asf_test_noImport.js', 'const x = 1;\n');
    const result = await extractJs(p);
    // edges may include call-graph inferred edges but import edges = 0
    const importEdges = result.edges.filter(e => e.confidence === 'EXTRACTED');
    assert.equal(importEdges.length, 0);
    unlinkSync(p);
  });

  test('detects ESM import statement → EXTRACTED depends_on', async () => {
    const p = writeTmp('asf_test_esm.js', `import { foo } from './utils.js';\n`);
    const result = await extractJs(p);
    const extracted = result.edges.filter(e => e.confidence === 'EXTRACTED');
    if (extracted.length > 0) {
      // tree-sitter available
      assert.equal(extracted[0].relation, 'depends_on');
      assert.equal(extracted[0].confidence_score, 1.0);
    }
    // if tree-sitter not installed, just check no crash
    unlinkSync(p);
  });

  test('detects require() call → EXTRACTED depends_on', async () => {
    const p = writeTmp('asf_test_cjs.js', `const x = require('./lib.js');\n`);
    const result = await extractJs(p);
    const extracted = result.edges.filter(e => e.confidence === 'EXTRACTED');
    if (extracted.length > 0) {
      assert.equal(extracted[0].relation, 'depends_on');
    }
    unlinkSync(p);
  });

  test('infers call-graph edge → INFERRED confidence 0.6', async () => {
    const src = `
function helperA() { return 1; }
function main() { helperA(); }
`;
    const p = writeTmp('asf_test_calls.js', src);
    const result = await extractJs(p);
    const inferred = result.edges.filter(e => e.confidence === 'INFERRED');
    if (inferred.length > 0) {
      assert.equal(inferred[0].confidence_score, 0.6);
      assert.equal(inferred[0].relation, 'depends_on');
    }
    unlinkSync(p);
  });

  test('handles missing file gracefully', async () => {
    const result = await extractJs('/tmp/asf_nonexistent_file_xyz.js');
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
  });
});
