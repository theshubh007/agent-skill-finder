/**
 * Gemini CLI BeforeToolSelection hook — narrows the tool space ASF routes through.
 *
 * stdin:  { llm_request: { messages: [{role, content}] } }
 * stdout: { hookSpecificOutput: { hookEventName: "BeforeToolSelection",
 *            toolConfig: { mode: "ANY", allowedFunctionNames: [...] } } }
 * fallback on any error: {} (never blocks Gemini)
 */

import { JITRouter } from '../router.js';
import { resolve } from 'node:path';

const indexDir = process.env.ASF_INDEX_DIR ?? resolve(process.env.HOME, '.asf');

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(p => p.type === 'text')
      .map(p => p.text ?? '')
      .join(' ');
  }
  return String(content);
}

async function readStdin() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

async function main() {
  const raw = await readStdin();
  const hookInput = JSON.parse(raw);
  const messages = hookInput.llm_request?.messages ?? [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const task = extractText(lastUser?.content);

  if (!task) { process.stdout.write('{}'); return; }

  const router = new JITRouter({ indexDir });
  const { bundle, timings } = await router.find({ task, tokenBudget: 4000, maxSkills: 5 });

  // Skill IDs are NOT Gemini function declarations — cannot be used as
  // allowedFunctionNames. Emitting toolConfig here caused 400 INVALID_ARGUMENT
  // ("not a subset of function_declarations"). Leave tool gating untouched.
  const sanitize = (id) => String(id).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_$&');
  const routedSkills = bundle.manifests.map(m => sanitize(m.id));

  try {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const all = JSON.parse(readFileSync(join(indexDir, '_index.json'), 'utf8'));
    const CHARS_PER_TOKEN = 3;
    const bt = bundle.manifests.reduce((s, m) => s + Math.ceil((m.description ?? '').length / CHARS_PER_TOKEN), 0);
    process.stderr.write(`[ASF] found ${bundle.manifests.length}/${all.length} skills | ~${bt} tokens | ${timings.total}ms\n`);
  } catch { /* never block Gemini */ }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'BeforeToolSelection',
      routedSkills,
    },
  }));
}

main().catch(() => process.stdout.write('{}'));
