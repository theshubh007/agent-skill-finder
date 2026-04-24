import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPair, signManifest, verifyManifest, verifyBundle,
} from '../../src/security/signing.js';

const { privateKey, publicKey } = generateKeyPair();

const BASE_MANIFEST = { id: 'test-skill', name: 'Test Skill', description: 'does testing' };

describe('generateKeyPair', () => {
  test('returns PEM-encoded private and public keys', () => {
    const { privateKey: priv, publicKey: pub } = generateKeyPair();
    assert.ok(priv.includes('PRIVATE KEY'));
    assert.ok(pub.includes('PUBLIC KEY'));
  });

  test('generates distinct key pairs each call', () => {
    const pair1 = generateKeyPair();
    const pair2 = generateKeyPair();
    assert.notEqual(pair1.privateKey, pair2.privateKey);
  });
});

describe('signManifest', () => {
  test('returns manifest with signature field', () => {
    const signed = signManifest(BASE_MANIFEST, privateKey);
    assert.ok('signature' in signed);
    assert.ok(typeof signed.signature === 'string');
    assert.ok(signed.signature.length > 0);
  });

  test('original fields preserved', () => {
    const signed = signManifest(BASE_MANIFEST, privateKey);
    assert.equal(signed.id,          BASE_MANIFEST.id);
    assert.equal(signed.name,        BASE_MANIFEST.name);
    assert.equal(signed.description, BASE_MANIFEST.description);
  });

  test('re-signing produces different signature (ed25519 is deterministic — same sig)', () => {
    // ed25519 is deterministic: same key + same payload → same signature
    const s1 = signManifest(BASE_MANIFEST, privateKey);
    const s2 = signManifest(BASE_MANIFEST, privateKey);
    assert.equal(s1.signature, s2.signature);
  });
});

describe('verifyManifest', () => {
  test('valid for freshly signed manifest', () => {
    const signed = signManifest(BASE_MANIFEST, privateKey);
    const { valid } = verifyManifest(signed, publicKey);
    assert.equal(valid, true);
  });

  test('invalid when signature tampered', () => {
    const signed    = signManifest(BASE_MANIFEST, privateKey);
    signed.signature = 'AAAA' + signed.signature.slice(4);
    const { valid } = verifyManifest(signed, publicKey);
    assert.equal(valid, false);
  });

  test('invalid when manifest field changed after signing', () => {
    const signed = signManifest(BASE_MANIFEST, privateKey);
    signed.description = 'tampered description';
    const { valid } = verifyManifest(signed, publicKey);
    assert.equal(valid, false);
  });

  test('invalid when no signature field', () => {
    const { valid, reason } = verifyManifest(BASE_MANIFEST, publicKey);
    assert.equal(valid, false);
    assert.equal(reason, 'no signature');
  });

  test('invalid when wrong public key used', () => {
    const { publicKey: otherPub } = generateKeyPair();
    const signed = signManifest(BASE_MANIFEST, privateKey);
    const { valid } = verifyManifest(signed, otherPub);
    assert.equal(valid, false);
  });
});

describe('verifyBundle', () => {
  test('allValid true when all manifests signed correctly', () => {
    const manifests = [
      signManifest({ id: 'a', name: 'A' }, privateKey),
      signManifest({ id: 'b', name: 'B' }, privateKey),
    ];
    const { allValid, results } = verifyBundle(manifests, publicKey);
    assert.equal(allValid, true);
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.valid));
  });

  test('allValid false when one manifest tampered', () => {
    const manifests = [
      signManifest({ id: 'a', name: 'A' }, privateKey),
      { id: 'b', name: 'B', description: 'unsigned' },
    ];
    const { allValid, results } = verifyBundle(manifests, publicKey);
    assert.equal(allValid, false);
    assert.equal(results.find((r) => r.id === 'b')?.valid, false);
  });

  test('empty bundle is allValid true', () => {
    const { allValid } = verifyBundle([], publicKey);
    assert.equal(allValid, true);
  });
});
