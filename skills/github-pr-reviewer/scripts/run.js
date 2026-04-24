/**
 * github-pr-reviewer — fetch a GitHub PR diff and return structured review feedback.
 *
 * Requires: GITHUB_TOKEN env var for private repos / higher rate limits.
 * Uses GitHub REST API v3 — no extra dependencies.
 */

const GITHUB_API = 'https://api.github.com';
const SEVERITY_PATTERNS = {
  error: [
    /\b(password|secret|token|api_key|private_key)\s*=\s*['"][^'"]+['"]/i,
    /console\.(log|debug)\s*\([^)]*?(token|secret|password)/i,
    /eval\s*\(/,
    /sql\s*=\s*[`'"].*\$\{/i,
    /process\.exit\s*\(\s*[^01]\s*\)/,
  ],
  warning: [
    /TODO|FIXME|HACK|XXX/,
    /\.then\s*\(.*\)\s*\.catch/,
    /catch\s*\(\s*e?\s*\)\s*\{\s*\}/,
    /var\s+\w+/,
    /==\s(?!=[=>])/,
  ],
  suggestion: [
    /function\s+\w{1,2}\s*\(/,
    /\/\/\s*$/,
    /console\.log/,
  ],
};

function makeHeaders() {
  const headers = {
    Accept: 'application/vnd.github.v3.diff',
    'User-Agent': 'agentskillfinder-github-pr-reviewer/1.0.0',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function parseDiffFiles(diffText) {
  const files = [];
  let current = null;
  let lineNum = 0;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      const match = line.match(/b\/(.+)$/);
      current = { file: match?.[1] ?? 'unknown', lines: [] };
      lineNum = 0;
    } else if (line.startsWith('@@')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      lineNum = m ? parseInt(m[1], 10) - 1 : 0;
    } else if (current) {
      if (!line.startsWith('-')) lineNum++;
      if (line.startsWith('+') && !line.startsWith('+++')) {
        current.lines.push({ lineNum, content: line.slice(1) });
      }
    }
  }
  if (current) files.push(current);
  return files;
}

function annotateFile(file, focus) {
  const annotations = [];
  for (const { lineNum, content } of file.lines) {
    for (const [severity, patterns] of Object.entries(SEVERITY_PATTERNS)) {
      if (focus !== 'all' && severity !== 'error') {
        if (focus === 'security' && severity !== 'error') continue;
        if (focus === 'performance' && severity === 'suggestion') continue;
      }
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          annotations.push({
            file: file.file,
            line: lineNum,
            severity,
            message: describeMatch(pattern, content),
            suggestion: buildSuggestion(severity, pattern),
          });
          break;
        }
      }
    }
  }
  return annotations;
}

function describeMatch(pattern, content) {
  const src = pattern.source;
  if (/password|secret|token|api_key/.test(src)) return 'Potential credential exposed in diff';
  if (/console.*token/.test(src)) return 'Sensitive value logged to console';
  if (/eval/.test(src)) return 'eval() usage — potential code injection';
  if (/sql.*\$\{/.test(src)) return 'Possible SQL injection via template literal';
  if (/TODO|FIXME/.test(src)) return `Unresolved ${content.match(/TODO|FIXME|HACK|XXX/)?.[0] ?? 'marker'}`;
  if (/catch.*\{\s*\}/.test(src)) return 'Empty catch block suppresses errors silently';
  if (/var\s/.test(src)) return 'Prefer const/let over var';
  if (/==\s/.test(src)) return 'Prefer === over == for strict equality';
  if (/console\.log/.test(src)) return 'Debug console.log left in code';
  return 'Pattern match: ' + src.slice(0, 40);
}

function buildSuggestion(severity, pattern) {
  const src = pattern.source;
  if (/password|secret|token/.test(src)) return 'Move to environment variable or secrets manager';
  if (/eval/.test(src)) return 'Use JSON.parse() or Function() with strict input validation';
  if (/var\s/.test(src)) return 'Replace with const (or let if reassigned)';
  if (/==\s/.test(src)) return 'Use === for type-safe comparison';
  if (/console\.log/.test(src)) return 'Remove or replace with structured logger';
  return null;
}

function computeLgtmScore(annotations) {
  if (annotations.length === 0) return 1.0;
  const errorPenalty = annotations.filter((a) => a.severity === 'error').length * 0.25;
  const warnPenalty = annotations.filter((a) => a.severity === 'warning').length * 0.05;
  return Math.max(0, 1.0 - errorPenalty - warnPenalty);
}

export async function reviewPR({ repo, pr_number, focus = 'all' }) {
  const url = `${GITHUB_API}/repos/${repo}/pulls/${pr_number}`;
  const res = await fetch(url, { headers: makeHeaders() });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${repo}#${pr_number}: ${await res.text()}`);
  }

  const diffText = await res.text();
  const files = parseDiffFiles(diffText);
  const annotations = files.flatMap((f) => annotateFile(f, focus));
  const lgtm_score = computeLgtmScore(annotations);

  const errors = annotations.filter((a) => a.severity === 'error').length;
  const warnings = annotations.filter((a) => a.severity === 'warning').length;
  const suggestions = annotations.filter((a) => a.severity === 'suggestion').length;

  const summary =
    errors === 0 && warnings === 0
      ? `LGTM — ${files.length} file(s) reviewed, no blocking issues`
      : `${errors} error(s), ${warnings} warning(s), ${suggestions} suggestion(s) across ${files.length} file(s)`;

  return {
    review: {
      summary,
      lgtm_score,
      file_count: files.length,
      annotation_count: annotations.length,
    },
    lgtm_score,
    annotations,
  };
}
