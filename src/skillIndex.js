import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadAntigravitySkills } from './adapters/antigravity.js';
import { loadClaudeSkills } from './adapters/claude_skills.js';
import { loadScientificSkills } from './adapters/scientific.js';
import { loadAwesomeClaudeSkills } from './adapters/awesome_claude.js';
import { loadMcpServerSkills } from './adapters/mcp_server.js';

/**
 * Built-in registry descriptors keyed by registry name.
 * Each entry maps a registry name to its loader function + path resolver.
 */
const BUILTIN_REGISTRIES = [
  { name: 'antigravity-awesome-skills', subdir: 'antigravity-awesome-skills', loader: loadAntigravitySkills },
  { name: 'claude-skills',              subdir: 'claude-skills',              loader: loadClaudeSkills },
  { name: 'scientific-agent-skills',    subdir: 'scientific-agent-skills',    loader: loadScientificSkills },
  { name: 'awesome-claude-skills',      subdir: 'awesome-claude-skills',      loader: loadAwesomeClaudeSkills },
];

/**
 * Deduplicate manifests by id, keeping first occurrence.
 * @param {import('./manifest.js').SkillManifest[]} manifests
 */
function dedupe(manifests) {
  const seen = new Set();
  return manifests.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export class SkillIndex {
  /**
   * Ingest all registry sources, deduplicate, and write skills/_index.json.
   *
   * @param {object} opts
   * @param {string} opts.sourcesRoot   root dir containing registry subdirs
   * @param {string[]} [opts.sources]   explicit registry dirs or mcp:// URLs; defaults to all builtins
   * @param {string} [opts.outputDir]   dir to write _index.json; defaults to sourcesRoot/skills
   * @param {(msg: string) => void} [opts.log]  progress callback
   * @returns {Promise<{skillCount: number, canonicalCount: number, buildTimeMs: number}>}
   */
  static async build({ sourcesRoot, sources, outputDir, log = () => {} }) {
    const t0 = Date.now();
    const root = resolve(sourcesRoot);
    const outDir = outputDir ? resolve(outputDir) : join(root, '..', 'agent-skill-finder', 'skills');
    await mkdir(outDir, { recursive: true });

    const all = [];

    if (sources && sources.length > 0) {
      // explicit sources
      for (const src of sources) {
        if (src.startsWith('mcp://')) {
          log(`[ingest] ${src} (mcp)`);
          try {
            const manifests = await loadMcpServerSkills(src);
            log(`[ingest] ${src.padEnd(40)} : ${manifests.length} skills`);
            all.push(...manifests);
          } catch (err) {
            log(`[ingest] ${src} FAILED: ${err.message}`);
          }
          continue;
        }
        // find matching builtin
        const builtin = BUILTIN_REGISTRIES.find(r => src.includes(r.subdir));
        if (builtin) {
          const regPath = resolve(src);
          const manifests = await builtin.loader(regPath);
          log(`[ingest] ${builtin.name.padEnd(40)} : ${String(manifests.length).padStart(4)} skills`);
          all.push(...manifests);
        }
      }
    } else {
      // default: walk all builtins relative to sourcesRoot
      for (const reg of BUILTIN_REGISTRIES) {
        const regPath = join(root, reg.subdir);
        try {
          const manifests = await reg.loader(regPath);
          log(`[ingest] ${reg.name.padEnd(40)} : ${String(manifests.length).padStart(4)} skills`);
          all.push(...manifests);
        } catch (err) {
          log(`[ingest] ${reg.name} FAILED: ${err.message}`);
        }
      }
    }

    const rawCount = all.length;
    const canonical = dedupe(all);
    const pct = rawCount > 0 ? ((rawCount - canonical.length) / rawCount * 100).toFixed(1) : '0.0';
    log(`[canonicalize] ${rawCount} raw → ${canonical.length} canonical  (-${pct}% via dedupe)`);

    const indexPath = join(outDir, '_index.json');
    await writeFile(indexPath, JSON.stringify(canonical, null, 2), 'utf8');
    log(`[index] written → ${indexPath}`);

    return {
      skillCount: rawCount,
      canonicalCount: canonical.length,
      buildTimeMs: Date.now() - t0,
    };
  }
}
