import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installClaude, installGemini, installCodex, install } from '../src/installer.js';

// ── injectable in-memory fs ───────────────────────────────────────────────────

function makeFs(initial = {}) {
  const store = { ...initial };
  return {
    store,
    async readFile(p) {
      if (!(p in store)) { const e = new Error(`ENOENT: ${p}`); e.code = 'ENOENT'; throw e; }
      return store[p];
    },
    async writeFile(p, content) { store[p] = content; },
    async mkdir() {},
  };
}

// ── claude target ─────────────────────────────────────────────────────────────

describe('installClaude', () => {
  test('writes ASF block to empty CLAUDE.md', async () => {
    const fs = makeFs();
    const result = await installClaude({ claudeMdPath: '/tmp/CLAUDE.md', fs });
    assert.ok(fs.store['/tmp/CLAUDE.md'].includes('agentskillfinder'));
    assert.equal(result.alreadyInstalled, false);
  });

  test('appends to existing CLAUDE.md without clobbering content', async () => {
    const fs = makeFs({ '/tmp/CLAUDE.md': '# My Rules\nDo not do X.' });
    await installClaude({ claudeMdPath: '/tmp/CLAUDE.md', fs });
    assert.ok(fs.store['/tmp/CLAUDE.md'].includes('# My Rules'));
    assert.ok(fs.store['/tmp/CLAUDE.md'].includes('agentskillfinder'));
  });

  test('inserts custom hookScript path into written block', async () => {
    const fs = makeFs();
    await installClaude({ claudeMdPath: '/tmp/CLAUDE.md', hookScript: '/opt/asf/hooks/preToolUse.js', fs });
    assert.ok(fs.store['/tmp/CLAUDE.md'].includes('/opt/asf/hooks/preToolUse.js'));
  });

  test('returns alreadyInstalled true when block already present', async () => {
    const fs = makeFs({ '/tmp/CLAUDE.md': '# Config\n\n## ASF Routing (agentskillfinder)\nalready here' });
    const result = await installClaude({ claudeMdPath: '/tmp/CLAUDE.md', fs });
    assert.equal(result.alreadyInstalled, true);
  });

  test('does not double-write when alreadyInstalled', async () => {
    const existing = '# Existing\n\n## ASF Routing (agentskillfinder)\nold block';
    const fs = makeFs({ '/tmp/CLAUDE.md': existing });
    await installClaude({ claudeMdPath: '/tmp/CLAUDE.md', fs });
    assert.equal(fs.store['/tmp/CLAUDE.md'], existing);
  });

  test('returns path in result', async () => {
    const fs = makeFs();
    const result = await installClaude({ claudeMdPath: '/custom/CLAUDE.md', fs });
    assert.equal(result.path, '/custom/CLAUDE.md');
  });
});

// ── gemini target ─────────────────────────────────────────────────────────────

describe('installGemini', () => {
  test('writes settings.json with skillRouter block', async () => {
    const fs = makeFs();
    const result = await installGemini({ settingsPath: '/tmp/.gemini/settings.json', fs });
    const parsed = JSON.parse(fs.store['/tmp/.gemini/settings.json']);
    assert.equal(parsed.skillRouter.provider, 'agentskillfinder');
    assert.equal(result.alreadyInstalled, false);
  });

  test('merges into existing settings.json without clobbering other keys', async () => {
    const initial = JSON.stringify({ theme: 'dark', other: true });
    const fs = makeFs({ '/tmp/.gemini/settings.json': initial });
    await installGemini({ settingsPath: '/tmp/.gemini/settings.json', fs });
    const parsed = JSON.parse(fs.store['/tmp/.gemini/settings.json']);
    assert.equal(parsed.theme, 'dark');
    assert.equal(parsed.skillRouter.provider, 'agentskillfinder');
  });

  test('uses custom asfBin in command', async () => {
    const fs = makeFs();
    await installGemini({ settingsPath: '/tmp/.gemini/settings.json', asfBin: '/usr/local/bin/asf', fs });
    const parsed = JSON.parse(fs.store['/tmp/.gemini/settings.json']);
    assert.ok(parsed.skillRouter.command.includes('/usr/local/bin/asf'));
  });

  test('returns alreadyInstalled true when already configured', async () => {
    const existing = JSON.stringify({ skillRouter: { provider: 'agentskillfinder' } });
    const fs = makeFs({ '/tmp/.gemini/settings.json': existing });
    const result = await installGemini({ settingsPath: '/tmp/.gemini/settings.json', fs });
    assert.equal(result.alreadyInstalled, true);
  });

  test('returns path in result', async () => {
    const fs = makeFs();
    const result = await installGemini({ settingsPath: '/custom/.gemini/settings.json', fs });
    assert.equal(result.path, '/custom/.gemini/settings.json');
  });
});

// ── codex target ──────────────────────────────────────────────────────────────

describe('installCodex', () => {
  test('writes ASF block to AGENTS.md and creates .codex/hooks.json', async () => {
    const fs = makeFs();
    const result = await installCodex({
      agentsMdPath: '/tmp/AGENTS.md',
      hooksJsonPath: '/tmp/.codex/hooks.json',
      fs,
    });
    assert.ok(fs.store['/tmp/AGENTS.md'].includes('agentskillfinder'));
    const hooks = JSON.parse(fs.store['/tmp/.codex/hooks.json']);
    assert.ok('preToolUse' in hooks);
    assert.equal(result.alreadyInstalled, false);
  });

  test('appends to existing AGENTS.md without clobbering content', async () => {
    const fs = makeFs({ '/tmp/AGENTS.md': '# My Agents\nDo this.' });
    await installCodex({ agentsMdPath: '/tmp/AGENTS.md', hooksJsonPath: '/tmp/.codex/hooks.json', fs });
    assert.ok(fs.store['/tmp/AGENTS.md'].includes('# My Agents'));
    assert.ok(fs.store['/tmp/AGENTS.md'].includes('agentskillfinder'));
  });

  test('merges into existing hooks.json without clobbering other keys', async () => {
    const initial = JSON.stringify({ otherHook: { command: 'other' } });
    const fs = makeFs({ '/tmp/.codex/hooks.json': initial });
    await installCodex({ agentsMdPath: '/tmp/AGENTS.md', hooksJsonPath: '/tmp/.codex/hooks.json', fs });
    const hooks = JSON.parse(fs.store['/tmp/.codex/hooks.json']);
    assert.ok('otherHook' in hooks);
    assert.ok('preToolUse' in hooks);
  });

  test('uses custom asfBin in hooks.json command', async () => {
    const fs = makeFs();
    await installCodex({
      agentsMdPath: '/tmp/AGENTS.md',
      hooksJsonPath: '/tmp/.codex/hooks.json',
      asfBin: '/usr/local/bin/asf',
      fs,
    });
    const hooks = JSON.parse(fs.store['/tmp/.codex/hooks.json']);
    assert.ok(hooks.preToolUse.command.includes('/usr/local/bin/asf'));
  });

  test('returns alreadyInstalled true when agentskillfinder already in AGENTS.md', async () => {
    const fs = makeFs({ '/tmp/AGENTS.md': '# Existing\n\n## ASF Routing (agentskillfinder)' });
    const result = await installCodex({ agentsMdPath: '/tmp/AGENTS.md', hooksJsonPath: '/tmp/.codex/hooks.json', fs });
    assert.equal(result.alreadyInstalled, true);
  });

  test('returns both paths in result', async () => {
    const fs = makeFs();
    const result = await installCodex({ agentsMdPath: '/tmp/AGENTS.md', hooksJsonPath: '/tmp/.codex/hooks.json', fs });
    assert.ok(result.paths.includes('/tmp/AGENTS.md'));
    assert.ok(result.paths.includes('/tmp/.codex/hooks.json'));
  });
});

describe('install dispatcher', () => {
  test('install claude delegates to installClaude', async () => {
    const fs = makeFs();
    const result = await install('claude', { claudeMdPath: '/tmp/CLAUDE.md', fs });
    assert.ok(fs.store['/tmp/CLAUDE.md'].includes('agentskillfinder'));
  });

  test('install gemini delegates to installGemini', async () => {
    const fs = makeFs();
    await install('gemini', { settingsPath: '/tmp/.gemini/settings.json', fs });
    const parsed = JSON.parse(fs.store['/tmp/.gemini/settings.json']);
    assert.equal(parsed.skillRouter.provider, 'agentskillfinder');
  });

  test('install codex delegates to installCodex', async () => {
    const fs = makeFs();
    const result = await install('codex', {
      agentsMdPath: '/tmp/AGENTS.md',
      hooksJsonPath: '/tmp/.codex/hooks.json',
      fs,
    });
    assert.ok(fs.store['/tmp/AGENTS.md'].includes('agentskillfinder'));
  });

  test('install unknown target throws', async () => {
    await assert.rejects(() => install('unknowntarget', {}), /Unknown install target/);
  });
});
