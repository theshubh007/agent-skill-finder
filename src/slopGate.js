/**
 * 6-signal anti-slop quality gate.
 * Score ∈ [0, 1]. Score < QUARANTINE_THRESHOLD → quarantine (demotion, not deletion).
 *
 * Signals:
 *   1. description_uniqueness  — SBERT cosine vs registry mean (caller-supplied)
 *   2. graph_isolation         — degree ≤ 1 in SKG → likely unused
 *   3. description_template    — regex match against known LLM boilerplate n-grams
 *   4. name_collision          — Levenshtein ≤ 2 against existing canonicals
 *   5. ast_duplicate           — AST hash in known canonical set
 *   6. empty_content           — missing scripts or zero executable lines
 */

export const QUARANTINE_THRESHOLD = 0.4;

// Boilerplate n-gram patterns mined from known templated skills
export const BOILERPLATE_PATTERNS = [
  /\bthis (tool|skill|assistant) (helps|allows|enables|provides)\b/i,
  /\bleverages (state-of-the-art|cutting-edge|advanced|modern)\b/i,
  /\bcomprehensive (solution|approach|framework|tool)\b/i,
  /\bpowerful (tool|assistant|capability|feature)\b/i,
  /\bseamlessly (integrates?|works?|handles?|supports?)\b/i,
  /\bstreamline your workflow\b/i,
  /\bboost (your )?productivity\b/i,
  /\beasy[- ]to[- ]use\b/i,
  /\buser[- ]friendly\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\buse when working with\b/i,
  /\bneeding guidance, best practices, or checklists for\b/i,
];

// Logistic regression weights (sum = 1.0)
const WEIGHTS = {
  description_template: 0.25,
  empty_content:        0.25,
  graph_isolation:      0.20,
  description_uniqueness: 0.15,
  name_collision:       0.08,
  ast_duplicate:        0.07,
};

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normName(s) {
  return s.toLowerCase().replace(/[-_\s]/g, '');
}

// ── Individual signal scorers ──────────────────────────────────────────────

/**
 * Signal 3 — description template score. 1 = original, 0 = pure boilerplate.
 * @param {string} description
 * @returns {number}
 */
export function signalDescriptionTemplate(description) {
  const hits = BOILERPLATE_PATTERNS.filter((p) => p.test(description)).length;
  return hits === 0 ? 1.0 : Math.max(0, 1 - hits * 0.25);
}

/**
 * Signal 4 — name collision score. 1 = unique, 0 = collides with a canonical.
 * @param {string} name
 * @param {string[]} canonicalNames  existing canonical names
 * @returns {number}
 */
export function signalNameCollision(name, canonicalNames) {
  const norm = normName(name);
  for (const existing of canonicalNames) {
    if (levenshtein(norm, normName(existing)) <= 2) return 0;
  }
  return 1;
}

/**
 * Signal 2 — graph isolation score. 0 = isolated (degree ≤ 1), 1 = connected.
 * @param {number} degree  degree in the SKG, or edge count from manifest graph fields
 * @returns {number}
 */
export function signalGraphIsolation(degree) {
  return degree <= 1 ? 0 : 1;
}

/**
 * Signal 5 — AST duplicate score. 1 = unique, 0 = hash in canonical set.
 * @param {string|null} hash
 * @param {Set<string>} canonicalHashes
 * @returns {number}
 */
export function signalAstDuplicate(hash, canonicalHashes) {
  if (!hash) return 1;
  return canonicalHashes.has(hash) ? 0 : 1;
}

/**
 * Signal 6 — empty content score. 1 = has executable content, 0 = missing.
 * @param {boolean} hasScripts
 * @param {number} [executableLines]
 * @returns {number}
 */
export function signalEmptyContent(hasScripts, executableLines = 0) {
  if (!hasScripts) return 0;
  return executableLines > 0 ? 1.0 : 0.5;
}

// ── Main scorer ────────────────────────────────────────────────────────────

/**
 * Compute slop_score for a skill using all 6 signals.
 *
 * @param {{
 *   descriptionUniqueness?: number,
 *   graphDegree?: number,
 *   description?: string,
 *   name?: string,
 *   canonicalNames?: string[],
 *   scriptHash?: string|null,
 *   canonicalHashes?: Set<string>,
 *   hasScripts?: boolean,
 *   executableLines?: number,
 * }} opts
 * @returns {{ slopScore: number, signals: Record<string, number>, quarantined: boolean }}
 */
export function computeSlopScore({
  descriptionUniqueness = 1.0,
  graphDegree = 0,
  description = '',
  name = '',
  canonicalNames = [],
  scriptHash = null,
  canonicalHashes = new Set(),
  hasScripts = false,
  executableLines = 0,
} = {}) {
  const signals = {
    description_uniqueness: descriptionUniqueness,
    graph_isolation:        signalGraphIsolation(graphDegree),
    description_template:   signalDescriptionTemplate(description),
    name_collision:         signalNameCollision(name, canonicalNames),
    ast_duplicate:          signalAstDuplicate(scriptHash, canonicalHashes),
    empty_content:          signalEmptyContent(hasScripts, executableLines),
  };

  const slopScore = Math.round(
    Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * signals[k], 0) * 100,
  ) / 100;

  return { slopScore, signals, quarantined: slopScore < QUARANTINE_THRESHOLD };
}
