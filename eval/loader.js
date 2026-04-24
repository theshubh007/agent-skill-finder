import { readFile } from 'node:fs/promises';

// ── SimHash ───────────────────────────────────────────────────────────────────

const SIMHASH_BITS = 64;

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// FNV-1a 32-bit hash of a string token
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Compute a 64-bit SimHash fingerprint (as two 32-bit integers) for a text string.
 *
 * @param {string} text
 * @returns {[number, number]}  [hi, lo] — two 32-bit halves of the 64-bit fingerprint
 */
export function simhash(text) {
  const tokens = tokenize(text);
  const v = new Int32Array(SIMHASH_BITS);

  for (const token of tokens) {
    const h = fnv1a(token);
    // Use two different hash seeds for hi/lo halves
    const h2 = fnv1a(token + '\x00');
    for (let i = 0; i < 32; i++) {
      v[i] += (h >> i) & 1 ? 1 : -1;
    }
    for (let i = 0; i < 32; i++) {
      v[32 + i] += (h2 >> i) & 1 ? 1 : -1;
    }
  }

  let hi = 0, lo = 0;
  for (let i = 0; i < 32; i++) if (v[i] > 0) hi |= (1 << i);
  for (let i = 0; i < 32; i++) if (v[32 + i] > 0) lo |= (1 << i);

  return [hi >>> 0, lo >>> 0];
}

/**
 * Hamming distance between two 64-bit SimHash fingerprints.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {number}
 */
export function hammingDistance(a, b) {
  let dist = 0;
  let xhi = (a[0] ^ b[0]) >>> 0;
  let xlo = (a[1] ^ b[1]) >>> 0;
  while (xhi) { dist += xhi & 1; xhi >>>= 1; }
  while (xlo) { dist += xlo & 1; xlo >>>= 1; }
  return dist;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplicate an array of task records by SimHash near-duplicate detection.
 *
 * @param {object[]} tasks        each record must have a `query` string field
 * @param {number}   threshold    max hamming distance to consider near-duplicate (default 6)
 * @returns {object[]}            deduplicated tasks (first occurrence wins)
 */
export function dedup(tasks, threshold = 6) {
  const fingerprints = [];
  const kept = [];

  for (const task of tasks) {
    const fp = simhash(task.query ?? task.task ?? '');
    const isDup = fingerprints.some((existing) => hammingDistance(existing, fp) <= threshold);
    if (!isDup) {
      fingerprints.push(fp);
      kept.push(task);
    }
  }

  return kept;
}

// ── JSONL loader ──────────────────────────────────────────────────────────────

/**
 * Load a JSONL file and return parsed records.
 *
 * @param {string} filePath
 * @returns {Promise<object[]>}
 */
export async function loadJsonl(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Load a SkillsBench++ JSONL dataset with SimHash deduplication applied.
 *
 * @param {string} filePath      path to .jsonl file
 * @param {{ threshold?: number }} opts
 * @returns {Promise<{ tasks: object[], rawCount: number, dedupCount: number }>}
 */
export async function loadSkillsBench(filePath, { threshold = 6 } = {}) {
  const raw = await loadJsonl(filePath);
  const tasks = dedup(raw, threshold);
  return { tasks, rawCount: raw.length, dedupCount: tasks.length };
}
