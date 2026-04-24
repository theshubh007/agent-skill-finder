import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readOrEmpty(filePath, fs) {
  try {
    return await (fs?.readFile ?? readFile)(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function ensureWrite(filePath, content, fs) {
  const dir = dirname(filePath);
  await (fs?.mkdir ?? mkdir)(dir, { recursive: true });
  await (fs?.writeFile ?? writeFile)(filePath, content, 'utf8');
}

// ── Claude target ─────────────────────────────────────────────────────────────

const CLAUDE_MD_BLOCK = (hookScript) => `
## ASF Routing (agentskillfinder)

AgentSkillFinder intercepts every tool call and routes through its 4-stage pipeline
(ANN recall → cross-encoder rerank → graph walk → plan) before the tool runs.

### Hooks

#### PreToolUse
\`\`\`json
{
  "matcher": ".*",
  "hooks": [{ "type": "command", "command": "node ${hookScript}" }]
}
\`\`\`
`;

/**
 * Inject ASF PreToolUse hook config into user's CLAUDE.md.
 *
 * @param {{ claudeMdPath?: string, hookScript?: string, fs?: object }} opts
 * @returns {Promise<{ path: string, alreadyInstalled: boolean }>}
 */
export async function installClaude({
  claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md'),
  hookScript = join(homedir(), '.npm', '_npx', 'asf', 'hooks', 'preToolUse.js'),
  fs = null,
} = {}) {
  const existing = await readOrEmpty(claudeMdPath, fs);

  if (existing.includes('agentskillfinder')) {
    return { path: claudeMdPath, alreadyInstalled: true };
  }

  const updated = existing.trimEnd() + '\n' + CLAUDE_MD_BLOCK(hookScript);
  await ensureWrite(claudeMdPath, updated, fs);

  return { path: claudeMdPath, alreadyInstalled: false };
}

// ── Main install dispatcher ───────────────────────────────────────────────────

/**
 * Install ASF hooks for a given agent target.
 *
 * @param {'claude' | 'gemini' | 'codex' | 'cursor'} target
 * @param {object} opts  target-specific options (paths, fs overrides for testing)
 * @returns {Promise<object>}
 */
export async function install(target, opts = {}) {
  switch (target) {
    case 'claude':  return installClaude(opts);
    default:        throw new Error(`Unknown install target: ${target}`);
  }
}
