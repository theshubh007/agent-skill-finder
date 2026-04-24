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
  const { bundle } = await router.find({ task, tokenBudget: 4000, maxSkills: 5 });
  const allowedFunctionNames = bundle.manifests.map(m => m.id);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'BeforeToolSelection',
      toolConfig: { mode: 'ANY', allowedFunctionNames },
    },
  }));
}

main().catch(() => process.stdout.write('{}'));
