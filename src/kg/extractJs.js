import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

let Parser, JavaScript, TypeScript;

function loadTreeSitter() {
  if (Parser) return;
  try {
    const ts = await import('tree-sitter');
    Parser = ts.default ?? ts;
    JavaScript = (await import('tree-sitter-javascript')).default;
    TypeScript = (await import('tree-sitter-typescript')).typescript;
  } catch {
    Parser = null;
  }
}

// tree-sitter is optional at ingest time; lazy-load to avoid hard failure
async function getParser(ext) {
  if (Parser === undefined) {
    try {
      const ts = (await import('tree-sitter')).default;
      const Js = (await import('tree-sitter-javascript')).default;
      const Ts = (await import('tree-sitter-typescript')).typescript;
      Parser = ts;
      JavaScript = Js;
      TypeScript = Ts;
    } catch {
      Parser = null;
    }
  }
  if (!Parser) return null;
  const parser = new Parser();
  parser.setLanguage(ext === '.ts' || ext === '.tsx' ? TypeScript : JavaScript);
  return parser;
}

function makeId(...parts) {
  return parts.join(':').replace(/[^a-zA-Z0-9:._/-]/g, '_');
}

function collectImports(rootNode, sourceBytes, fileStem, strPath) {
  const edges = [];
  function walk(node) {
    if (node.type === 'import_statement') {
      for (const child of node.children) {
        if (child.type === 'string') {
          const raw = sourceBytes.slice(child.startIndex, child.endIndex)
            .toString('utf8').replace(/^['"`]|['"`]$/g, '');
          if (!raw) continue;
          // Only relative imports map to known skill nodes
          const targetId = raw.startsWith('.')
            ? makeId(strPath, raw)
            : makeId(raw);
          edges.push({
            source: makeId(strPath),
            target: targetId,
            relation: 'depends_on',
            confidence: 'EXTRACTED',
            confidence_score: 1.0,
            source_file: strPath,
            source_location: `L${node.startPosition.row + 1}`,
            weight: 1.0,
          });
          break;
        }
      }
    }
    // require('...') — call_expression where callee is 'require'
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      const args = node.childForFieldName('arguments');
      if (fn && fn.type === 'identifier' &&
          sourceBytes.slice(fn.startIndex, fn.endIndex).toString('utf8') === 'require' &&
          args) {
        for (const arg of args.children) {
          if (arg.type === 'string') {
            const raw = sourceBytes.slice(arg.startIndex, arg.endIndex)
              .toString('utf8').replace(/^['"`]|['"`]$/g, '');
            if (!raw) break;
            const targetId = raw.startsWith('.')
              ? makeId(strPath, raw)
              : makeId(raw);
            edges.push({
              source: makeId(strPath),
              target: targetId,
              relation: 'depends_on',
              confidence: 'EXTRACTED',
              confidence_score: 1.0,
              source_file: strPath,
              source_location: `L${node.startPosition.row + 1}`,
              weight: 1.0,
            });
            break;
          }
        }
      }
    }
    for (const child of node.children) walk(child);
  }
  walk(rootNode);
  return edges;
}

function collectCallEdges(rootNode, sourceBytes, fileStem, strPath, knownFunctions) {
  const edges = [];
  const seen = new Set();

  function walk(node, callerFn) {
    const isFnBoundary = node.type === 'function_declaration'
      || node.type === 'arrow_function'
      || node.type === 'method_definition';

    let newCaller = callerFn;
    if (isFnBoundary) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        newCaller = sourceBytes.slice(nameNode.startIndex, nameNode.endIndex).toString('utf8');
      }
    }

    if (node.type === 'call_expression' && callerFn) {
      const fn = node.childForFieldName('function');
      if (fn) {
        let calleeName = null;
        if (fn.type === 'identifier') {
          calleeName = sourceBytes.slice(fn.startIndex, fn.endIndex).toString('utf8');
        } else if (fn.type === 'member_expression') {
          const prop = fn.childForFieldName('property');
          if (prop) calleeName = sourceBytes.slice(prop.startIndex, prop.endIndex).toString('utf8');
        }
        if (calleeName && calleeName !== 'require' && knownFunctions.has(calleeName)) {
          const key = `${callerFn}→${calleeName}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({
              source: makeId(strPath, callerFn),
              target: makeId(strPath, calleeName),
              relation: 'depends_on',
              confidence: 'INFERRED',
              confidence_score: 0.6,
              source_file: strPath,
              source_location: `L${node.startPosition.row + 1}`,
              weight: 0.6,
            });
          }
        }
      }
    }

    for (const child of node.children) walk(child, newCaller);
  }
  walk(rootNode, null);
  return edges;
}

function collectFunctionNames(rootNode, sourceBytes) {
  const names = new Set();
  function walk(node) {
    if (node.type === 'function_declaration' || node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) names.add(sourceBytes.slice(nameNode.startIndex, nameNode.endIndex).toString('utf8'));
    }
    // arrow functions assigned to variables
    if (node.type === 'lexical_declaration') {
      for (const child of node.children) {
        if (child.type === 'variable_declarator') {
          const val = child.childForFieldName('value');
          if (val && val.type === 'arrow_function') {
            const nameNode = child.childForFieldName('name');
            if (nameNode) names.add(sourceBytes.slice(nameNode.startIndex, nameNode.endIndex).toString('utf8'));
          }
        }
      }
    }
    for (const child of node.children) walk(child);
  }
  walk(rootNode);
  return names;
}

/**
 * Extract skill dependency edges from a JS/TS source file using tree-sitter.
 *
 * @param {string} filePath  absolute path to .js/.ts/.tsx file
 * @returns {Promise<{nodes: object[], edges: object[]}>}
 */
export async function extractJs(filePath) {
  const ext = extname(filePath);
  const parser = await getParser(ext);
  const strPath = filePath;
  const stem = basename(filePath, ext);
  const fileId = makeId(strPath);

  const nodes = [{
    id: fileId,
    label: stem,
    file_type: 'skill',
    source_file: strPath,
    source_location: 'L1',
  }];

  if (!parser) {
    // tree-sitter not available — return file node only, no edges
    return { nodes, edges: [] };
  }

  let sourceBytes;
  try {
    sourceBytes = readFileSync(filePath);
  } catch {
    return { nodes, edges: [] };
  }

  const tree = parser.parse(sourceBytes);
  const root = tree.rootNode;

  const fnNames = collectFunctionNames(root, sourceBytes);
  const importEdges = collectImports(root, sourceBytes, stem, strPath);
  const callEdges = collectCallEdges(root, sourceBytes, stem, strPath, fnNames);

  return { nodes, edges: [...importEdges, ...callEdges] };
}
