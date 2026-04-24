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

// ── Gemini target ─────────────────────────────────────────────────────────────

const GEMINI_SETTINGS_BLOCK = (asfBin) => ({
  skillRouter: {
    provider: 'agentskillfinder',
    command: `${asfBin} query`,
    preActivation: true,
  },
});

/**
 * Inject ASF pre-router into .gemini/settings.json.
 *
 * @param {{ settingsPath?: string, asfBin?: string, fs?: object }} opts
 * @returns {Promise<{ path: string, alreadyInstalled: boolean }>}
 */
export async function installGemini({
  settingsPath = join(process.cwd(), '.gemini', 'settings.json'),
  asfBin = 'asf',
  fs = null,
} = {}) {
  const raw = await readOrEmpty(settingsPath, fs);
  let settings = {};
  try { settings = raw ? JSON.parse(raw) : {}; } catch { settings = {}; }

  if (settings.skillRouter?.provider === 'agentskillfinder') {
    return { path: settingsPath, alreadyInstalled: true };
  }

  Object.assign(settings, GEMINI_SETTINGS_BLOCK(asfBin));
  await ensureWrite(settingsPath, JSON.stringify(settings, null, 2) + '\n', fs);

  return { path: settingsPath, alreadyInstalled: false };
}

// ── Codex target ──────────────────────────────────────────────────────────────

const AGENTS_MD_BLOCK = (asfBin) => `
## ASF Routing (agentskillfinder)

AgentSkillFinder provides JIT skill routing. Before each tool call, run:

\`\`\`bash
${asfBin} query "<task description>"
\`\`\`

The output is a ranked SkillBundle. Use its composition plan to sequence tool calls.
`;

const CODEX_HOOKS = (asfBin) => ({
  preToolUse: {
    command: `${asfBin} query`,
    description: 'Route tool calls through ASF 4-stage pipeline',
  },
});

/**
 * Inject ASF routing into AGENTS.md and .codex/hooks.json.
 *
 * @param {{ agentsMdPath?: string, hooksJsonPath?: string, asfBin?: string, fs?: object }} opts
 * @returns {Promise<{ paths: string[], alreadyInstalled: boolean }>}
 */
export async function installCodex({
  agentsMdPath = join(process.cwd(), 'AGENTS.md'),
  hooksJsonPath = join(process.cwd(), '.codex', 'hooks.json'),
  asfBin = 'asf',
  fs = null,
} = {}) {
  const existingMd = await readOrEmpty(agentsMdPath, fs);

  if (existingMd.includes('agentskillfinder')) {
    return { paths: [agentsMdPath, hooksJsonPath], alreadyInstalled: true };
  }

  const updatedMd = existingMd.trimEnd() + '\n' + AGENTS_MD_BLOCK(asfBin);
  await ensureWrite(agentsMdPath, updatedMd, fs);

  const rawHooks = await readOrEmpty(hooksJsonPath, fs);
  let hooks = {};
  try { hooks = rawHooks ? JSON.parse(rawHooks) : {}; } catch { hooks = {}; }
  Object.assign(hooks, CODEX_HOOKS(asfBin));
  await ensureWrite(hooksJsonPath, JSON.stringify(hooks, null, 2) + '\n', fs);

  return { paths: [agentsMdPath, hooksJsonPath], alreadyInstalled: false };
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
    case 'gemini':  return installGemini(opts);
    case 'codex':   return installCodex(opts);
    default:        throw new Error(`Unknown install target: ${target}`);
  }
}
