/**
 * asf pull — download pre-built canonical skill index (~40MB) from CDN.
 *
 * Fetches skills/_index.json + skills.lance.tar.gz from the GitHub release CDN,
 * extracts the LanceDB archive, and removes the intermediate tarball.
 */

import { createWriteStream, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export const CDN_BASE =
  'https://github.com/shubhamkothiya/agentskillfinder/releases/latest/download';

async function streamDownload(url, destPath, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN ${res.status} ${res.statusText}: ${url}`);

  const total = parseInt(res.headers.get('content-length') ?? '0', 10);
  let received = 0;

  const writer = createWriteStream(destPath);
  const reader = res.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
      received += value.length;
      if (onProgress && total > 0) onProgress(received, total);
    }
  } finally {
    reader.releaseLock();
  }

  await new Promise((res, rej) => writer.close((err) => (err ? rej(err) : res())));
  return received;
}

/**
 * Download the pre-built canonical skill index from CDN.
 *
 * @param {{ outputDir?: string, cdnBase?: string, log?: (msg: string) => void }} opts
 * @returns {Promise<{ outputDir: string, indexBytes: number, lanceBytes: number }>}
 */
export async function pull(opts = {}) {
  const outputDir = opts.outputDir ? resolve(opts.outputDir) : resolve('skills');
  const cdnBase = opts.cdnBase ?? CDN_BASE;
  const log = opts.log ?? ((msg) => process.stdout.write(msg + '\n'));

  mkdirSync(outputDir, { recursive: true });

  // Download _index.json
  const indexUrl = `${cdnBase}/skills_index.json`;
  const indexDest = join(outputDir, '_index.json');
  log('Downloading skills_index.json...');
  const indexBytes = await streamDownload(indexUrl, indexDest, (recv, total) => {
    process.stdout.write(
      `\r  ${Math.round((recv / total) * 100)}%  (${(recv / 1024).toFixed(0)} KB)    `,
    );
  });
  process.stdout.write('\n');
  log(`  ✓ _index.json  (${(indexBytes / 1024).toFixed(0)} KB)`);

  // Download skills.lance.tar.gz (~40MB LanceDB archive)
  const LANCE_ARCHIVE = 'skills_lance.tar.gz';
  const lanceUrl = `${cdnBase}/${LANCE_ARCHIVE}`;
  const lanceArchiveDest = join(outputDir, LANCE_ARCHIVE);
  log('Downloading skills_lance.tar.gz...');
  const lanceBytes = await streamDownload(lanceUrl, lanceArchiveDest, (recv, total) => {
    process.stdout.write(
      `\r  ${Math.round((recv / total) * 100)}%  (${(recv / 1024 / 1024).toFixed(1)} MB)    `,
    );
  });
  process.stdout.write('\n');
  log(`  ✓ skills_lance.tar.gz  (${(lanceBytes / 1024 / 1024).toFixed(1)} MB)`);

  // Extract archive and remove tarball
  log('Extracting skills.lance...');
  await execFileAsync('tar', ['-xzf', lanceArchiveDest, '-C', outputDir]);
  await unlink(lanceArchiveDest);
  log('  ✓ skills.lance ready');

  return { outputDir, indexBytes, lanceBytes };
}
