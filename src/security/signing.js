import { generateKeyPairSync, sign, verify } from 'node:crypto';

/**
 * Generate an ed25519 key pair for manifest signing.
 *
 * @returns {{ privateKey: string, publicKey: string }}  PEM-encoded keys
 */
export function generateKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  });
  return { privateKey, publicKey };
}

// Recursively sort object keys for deterministic JSON serialization.
function sortKeys(val) {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return val;
  return Object.fromEntries(Object.keys(val).sort().map((k) => [k, sortKeys(val[k])]));
}

function canonicalize(manifest) {
  // eslint-disable-next-line no-unused-vars
  const { signature: _sig, ...rest } = manifest;
  return JSON.stringify(sortKeys(rest));
}

/**
 * Sign a skill manifest with an ed25519 private key.
 * Returns a new manifest object with a `signature` field (base64).
 *
 * @param {object} manifest
 * @param {string} privateKeyPem
 * @returns {object}
 */
export function signManifest(manifest, privateKeyPem) {
  const payload = Buffer.from(canonicalize(manifest), 'utf8');
  const sig     = sign(null, payload, privateKeyPem);
  return { ...manifest, signature: sig.toString('base64') };
}

/**
 * Verify a signed skill manifest.
 *
 * @param {object} manifest  must include `signature` field
 * @param {string} publicKeyPem
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifyManifest(manifest, publicKeyPem) {
  const { signature } = manifest;
  if (!signature) return { valid: false, reason: 'no signature' };

  const payload = Buffer.from(canonicalize(manifest), 'utf8');
  const sigBuf  = Buffer.from(signature, 'base64');

  try {
    return { valid: verify(null, payload, publicKeyPem, sigBuf) };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

/**
 * Verify all manifests in a bundle.
 *
 * @param {object[]} manifests
 * @param {string} publicKeyPem
 * @returns {{ allValid: boolean, results: Array<{ id: string, valid: boolean, reason?: string }> }}
 */
export function verifyBundle(manifests, publicKeyPem) {
  const results  = manifests.map((m) => ({ id: m.id, ...verifyManifest(m, publicKeyPem) }));
  const allValid = results.every((r) => r.valid);
  return { allValid, results };
}
