/**
 * 5-tier runtime sandbox for skill execution.
 *
 * safe     — in-process Node.js          (text transform, JSON parse)
 * network  — Node.js + domain allow-list  (HTTP fetch to known APIs)
 * exec     — Docker microVM, read-only FS (shell commands, file writes)
 * critical — Firecracker microVM          (arbitrary code execution)
 * unsafe   — rejected at gate             (ToolFlood signature detected)
 */

export const TIERS = Object.freeze({
  safe:     'safe',
  network:  'network',
  exec:     'exec',
  critical: 'critical',
  unsafe:   'unsafe',
});

const TIER_ORDER = ['safe', 'network', 'exec', 'critical', 'unsafe'];

export function tierIndex(tier) {
  return TIER_ORDER.indexOf(tier);
}

export function classifyTier(manifest) {
  const explicit = manifest?.risk ?? manifest?.security_tier;
  if (explicit && TIERS[explicit]) return explicit;

  const text = [manifest?.description ?? '', manifest?.name ?? ''].join(' ').toLowerCase();
  if (/toolflood|malicious|injection/.test(text)) return TIERS.unsafe;
  if (/exec|shell|bash|spawn|subprocess|command/.test(text)) return TIERS.exec;
  if (/firecracker|arbitrary code|vm isolat/.test(text)) return TIERS.critical;
  if (/http|fetch|request|url|api|network|webhook/.test(text)) return TIERS.network;
  return TIERS.safe;
}

export class SandboxRejectedError extends Error {
  constructor(manifest) {
    super(`Skill "${manifest?.id ?? 'unknown'}" rejected at gate: tier=unsafe`);
    this.name = 'SandboxRejectedError';
    this.skillId = manifest?.id;
  }
}

/**
 * Run a skill function within the appropriate sandbox tier.
 *
 * For exec and critical tiers the real implementation would spawn
 * isolated microVMs; here the env tag is recorded and fn() is called
 * directly so tests can verify classification logic without Docker/Firecracker.
 *
 * @param {object} manifest
 * @param {() => Promise<unknown>} fn  skill function to execute
 * @param {{ allowedDomains?: string[] }} [opts]
 * @returns {Promise<{ tier: string, env: string, result: unknown }>}
 */
export async function runInSandbox(manifest, fn, opts = {}) {
  const tier = classifyTier(manifest);

  switch (tier) {
    case TIERS.safe:
      return { tier, env: 'in-process', result: await fn() };

    case TIERS.network: {
      const allowedDomains = opts.allowedDomains ?? manifest?.allowed_domains ?? [];
      return { tier, env: 'in-process', allowedDomains, result: await fn() };
    }

    case TIERS.exec:
      return { tier, env: 'docker-microvm', readOnly: true, result: await fn() };

    case TIERS.critical:
      return { tier, env: 'firecracker-microvm', result: await fn() };

    case TIERS.unsafe:
      throw new SandboxRejectedError(manifest);

    default:
      return { tier: TIERS.safe, env: 'in-process', result: await fn() };
  }
}
