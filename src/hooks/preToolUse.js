/**
 * PreToolUse hook — intercepts Claude Code tool lookup and runs ASF routing.
 *
 * Claude Code invokes this as a subprocess, passing hook input via stdin (JSON).
 * The hook writes a JSON response to stdout. When `decision` is "block", Claude Code
 * suppresses the tool call and shows `reason` to the user instead.
 *
 * Standalone pure function `runPreToolUse` is exported for testing without I/O.
 */

/**
 * Route a tool lookup through ASF and return an allow/block decision.
 *
 * @param {{ toolName: string, input: object, router: object, maxSkills?: number }} opts
 * @returns {Promise<{ decision: 'allow' | 'block', bundle: object | null, reason?: string }>}
 */
export async function runPreToolUse({ toolName, input, router, maxSkills = 5 }) {
  if (!toolName) {
    return { decision: 'allow', bundle: null };
  }

  try {
    const task = input?.description ?? input?.task ?? toolName;
    const { bundle } = await router.find({ task, maxSkills });
    return { decision: 'allow', bundle };
  } catch (err) {
    // On routing failure, allow the original tool call through
    return { decision: 'allow', bundle: null, reason: err.message };
  }
}

/**
 * CLI entry point — reads Claude Code hook JSON from stdin, writes response to stdout.
 * Only called when this module is run directly (`node preToolUse.js`).
 */
export async function main(router) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  const hookInput = JSON.parse(raw);
  const toolName = hookInput.tool_name ?? '';
  const input = hookInput.tool_input ?? {};

  const result = await runPreToolUse({ toolName, input, router });

  process.stdout.write(JSON.stringify({
    decision: result.decision,
    ...(result.reason ? { reason: result.reason } : {}),
  }));
}
