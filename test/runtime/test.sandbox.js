import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIERS, tierIndex, classifyTier,
  runInSandbox, SandboxRejectedError,
} from '../../src/runtime/sandbox.js';

describe('classifyTier', () => {
  test('explicit risk=safe', () => {
    assert.equal(classifyTier({ risk: 'safe' }), TIERS.safe);
  });

  test('explicit risk=network', () => {
    assert.equal(classifyTier({ risk: 'network' }), TIERS.network);
  });

  test('explicit risk=exec', () => {
    assert.equal(classifyTier({ risk: 'exec' }), TIERS.exec);
  });

  test('explicit risk=critical', () => {
    assert.equal(classifyTier({ risk: 'critical' }), TIERS.critical);
  });

  test('explicit risk=unsafe', () => {
    assert.equal(classifyTier({ risk: 'unsafe' }), TIERS.unsafe);
  });

  test('infers exec from description', () => {
    assert.equal(classifyTier({ description: 'run bash command on host' }), TIERS.exec);
  });

  test('infers network from description', () => {
    assert.equal(classifyTier({ description: 'HTTP fetch from external API' }), TIERS.network);
  });

  test('infers unsafe from toolflood keyword', () => {
    assert.equal(classifyTier({ description: 'toolflood bulk injection' }), TIERS.unsafe);
  });

  test('defaults to safe for unknown manifest', () => {
    assert.equal(classifyTier({ description: 'parse JSON string to object' }), TIERS.safe);
  });

  test('null manifest defaults to safe', () => {
    assert.equal(classifyTier(null), TIERS.safe);
  });
});

describe('tierIndex', () => {
  test('safe < network < exec < critical < unsafe', () => {
    assert.ok(tierIndex('safe') < tierIndex('network'));
    assert.ok(tierIndex('network') < tierIndex('exec'));
    assert.ok(tierIndex('exec') < tierIndex('critical'));
    assert.ok(tierIndex('critical') < tierIndex('unsafe'));
  });
});

describe('runInSandbox', () => {
  test('safe tier: runs fn and returns in-process env', async () => {
    const m = { id: 'a', risk: 'safe' };
    const r = await runInSandbox(m, async () => 42);
    assert.equal(r.tier, TIERS.safe);
    assert.equal(r.env, 'in-process');
    assert.equal(r.result, 42);
  });

  test('network tier: includes allowedDomains from opts', async () => {
    const m = { id: 'b', risk: 'network' };
    const r = await runInSandbox(m, async () => 'ok', { allowedDomains: ['api.example.com'] });
    assert.equal(r.tier, TIERS.network);
    assert.deepEqual(r.allowedDomains, ['api.example.com']);
  });

  test('network tier: falls back to manifest.allowed_domains', async () => {
    const m = { id: 'c', risk: 'network', allowed_domains: ['cdn.io'] };
    const r = await runInSandbox(m, async () => null);
    assert.deepEqual(r.allowedDomains, ['cdn.io']);
  });

  test('exec tier: env is docker-microvm with readOnly flag', async () => {
    const m = { id: 'd', risk: 'exec' };
    const r = await runInSandbox(m, async () => 'done');
    assert.equal(r.tier, TIERS.exec);
    assert.equal(r.env, 'docker-microvm');
    assert.equal(r.readOnly, true);
  });

  test('critical tier: env is firecracker-microvm', async () => {
    const m = { id: 'e', risk: 'critical' };
    const r = await runInSandbox(m, async () => 'done');
    assert.equal(r.tier, TIERS.critical);
    assert.equal(r.env, 'firecracker-microvm');
  });

  test('unsafe tier: throws SandboxRejectedError', async () => {
    const m = { id: 'f', risk: 'unsafe' };
    await assert.rejects(
      () => runInSandbox(m, async () => {}),
      (err) => err instanceof SandboxRejectedError && err.skillId === 'f',
    );
  });

  test('SandboxRejectedError message contains skill id', () => {
    const err = new SandboxRejectedError({ id: 'bad-skill' });
    assert.ok(err.message.includes('bad-skill'));
  });
});
