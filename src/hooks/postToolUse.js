/**
 * PostToolUse hook — logs tool execution outcomes to telemetry store.
 *
 * Claude Code invokes this after a tool completes. The hook receives the tool name,
 * input, and output via stdin JSON and can write telemetry to any backing store.
 */

/**
 * Log a tool execution outcome to the telemetry store.
 *
 * @param {{ toolName: string, input: object, output: object, store: object }} opts
 * @returns {Promise<{ logged: boolean, entry: object }>}
 */
export async function runPostToolUse({ toolName, input, output, store }) {
  const entry = {
    toolName,
    input,
    output,
    timestamp: Date.now(),
    success: !output?.isError,
  };

  await store.append(entry);
  return { logged: true, entry };
}

/**
 * CLI entry point — reads Claude Code hook JSON from stdin, writes telemetry.
 * Only called when this module is run directly (`node postToolUse.js`).
 */
export async function main(store) {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;

  const hookInput = JSON.parse(raw);
  const toolName = hookInput.tool_name ?? '';
  const input = hookInput.tool_input ?? {};
  const output = hookInput.tool_response ?? {};

  await runPostToolUse({ toolName, input, output, store });

  // PostToolUse hooks return empty stdout (no decision needed)
  process.stdout.write('{}');
}
