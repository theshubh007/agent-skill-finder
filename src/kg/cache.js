import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

const CACHE_FILE = 'skills/.cache.json';

function _bodyContent(raw, filePath) {
  if (!filePath.endsWith('.md')) return raw;
  const text = raw.toString('utf8');
  if (!text.startsWith('---')) return raw;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return raw;
  return Buffer.from(text.slice(end + 4));
}

/**
 * SHA256 of file body (frontmatter stripped for .md) + relative path.
 * Portable: same hash across machines sharing the same rootDir.
 *
 * @param {string} filePath
 * @param {string} [rootDir]
 * @returns {string} hex digest
 */
export function fileHash(filePath, rootDir = process.cwd()) {
  const p = resolve(filePath);
  const raw = readFileSync(p);
  const content = _bodyContent(raw, filePath);
  const h = createHash('sha256');
  h.update(content);
  h.update('\x00');
  try {
    const rel = relative(resolve(rootDir), p);
    h.update(rel);
  } catch {
    h.update(p);
  }
  return h.digest('hex');
}

/**
 * Load `skills/.cache.json` → `{ skillId: hash }` map.
 * Returns empty object when file is missing or corrupt.
 *
 * @param {string} [rootDir]
 * @returns {Record<string, string>}
 */
export function loadCache(rootDir = process.cwd()) {
  const cachePath = join(resolve(rootDir), CACHE_FILE);
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Persist cache map to `skills/.cache.json`.
 *
 * @param {Record<string, string>} cache
 * @param {string} [rootDir]
 */
export function saveCache(cache, rootDir = process.cwd()) {
  const cachePath = join(resolve(rootDir), CACHE_FILE);
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Returns true when the file's current hash differs from the cached value.
 *
 * @param {string} skillId
 * @param {string} filePath
 * @param {Record<string, string>} cache
 * @param {string} [rootDir]
 * @returns {boolean}
 */
export function isChanged(skillId, filePath, cache, rootDir = process.cwd()) {
  return cache[skillId] !== fileHash(filePath, rootDir);
}

/**
 * Record the current file hash for skillId into cache (mutates in place).
 *
 * @param {string} skillId
 * @param {string} filePath
 * @param {Record<string, string>} cache
 * @param {string} [rootDir]
 */
export function markCached(skillId, filePath, cache, rootDir = process.cwd()) {
  cache[skillId] = fileHash(filePath, rootDir);
}
