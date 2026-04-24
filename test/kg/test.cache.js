import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileHash, loadCache, saveCache, isChanged, markCached } from '../../src/kg/cache.js';

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'asf-cache-'));
  mkdirSync(join(dir, 'skills'));
  return dir;
}

describe('fileHash', () => {
  test('returns 64-char hex string', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    writeFileSync(f, '# Test\nBody content');
    assert.match(fileHash(f, dir), /^[0-9a-f]{64}$/);
  });

  test('same file same hash', () => {
    const dir = tempDir();
    const f = join(dir, 'a.md');
    writeFileSync(f, '# A\nSame');
    assert.equal(fileHash(f, dir), fileHash(f, dir));
  });

  test('different content → different hash', () => {
    const dir = tempDir();
    const f1 = join(dir, 'a.js');
    const f2 = join(dir, 'b.js');
    writeFileSync(f1, 'export const x = 1;');
    writeFileSync(f2, 'export const y = 2;');
    assert.notEqual(fileHash(f1, dir), fileHash(f2, dir));
  });

  test('md frontmatter change does not affect hash', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    const body = '## Usage\nSame body';
    writeFileSync(f, `---\ntitle: Old\n---\n${body}`);
    const h1 = fileHash(f, dir);
    writeFileSync(f, `---\ntitle: New\n---\n${body}`);
    const h2 = fileHash(f, dir);
    assert.equal(h1, h2);
  });

  test('md body change does affect hash', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    writeFileSync(f, '---\ntitle: X\n---\n## Body A');
    const h1 = fileHash(f, dir);
    writeFileSync(f, '---\ntitle: X\n---\n## Body B');
    const h2 = fileHash(f, dir);
    assert.notEqual(h1, h2);
  });
});

describe('loadCache / saveCache', () => {
  test('missing cache file returns empty object', () => {
    const dir = tempDir();
    assert.deepEqual(loadCache(dir), {});
  });

  test('round-trip save and load', () => {
    const dir = tempDir();
    const data = { 'skill-a': 'abc123', 'skill-b': 'def456' };
    saveCache(data, dir);
    assert.deepEqual(loadCache(dir), data);
  });

  test('corrupt cache file returns empty object', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'skills', '.cache.json'), 'not-json');
    assert.deepEqual(loadCache(dir), {});
  });
});

describe('isChanged / markCached', () => {
  test('new file not in cache is changed', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    writeFileSync(f, '# Test');
    assert.equal(isChanged('skill-a', f, {}, dir), true);
  });

  test('markCached then isChanged returns false', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    writeFileSync(f, '# Test');
    const cache = {};
    markCached('skill-a', f, cache, dir);
    assert.equal(isChanged('skill-a', f, cache, dir), false);
  });

  test('isChanged true after file body change', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    writeFileSync(f, '# Original');
    const cache = {};
    markCached('skill-a', f, cache, dir);
    writeFileSync(f, '# Modified');
    assert.equal(isChanged('skill-a', f, cache, dir), true);
  });

  test('markCached mutates cache in place', () => {
    const dir = tempDir();
    const f = join(dir, 'skill.md');
    writeFileSync(f, '# Test');
    const cache = {};
    markCached('my-skill', f, cache, dir);
    assert.ok('my-skill' in cache);
    assert.match(cache['my-skill'], /^[0-9a-f]{64}$/);
  });
});
