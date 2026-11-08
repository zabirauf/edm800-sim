// Bundles the simulator into one self-contained HTML file: dist/edm800-simulator.html (opens from disk, no server).
// A tiny module system: each ES module becomes a scoped factory registered in __mods; static imports are rewritten
// to destructuring from the registry; exports are collected into the module's export object.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'web/app.js';

const modules = new Map(); // relPath → { code, deps }
function load(rel) {
  if (modules.has(rel)) return;
  const src = readFileSync(join(root, rel), 'utf8');
  const deps = [];
  const exportNames = [];
  let code = src.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm, (_, names, spec) => {
    const dep = relative(root, resolve(dirname(join(root, rel)), spec));
    deps.push(dep);
    const bindings = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const m = /^(\w+)\s+as\s+(\w+)$/.exec(n);
        return m ? `${m[1]}: ${m[2]}` : n;
      });
    return `const { ${bindings.join(', ')} } = __mods[${JSON.stringify(dep)}];`;
  });
  code = code.replace(/^export\s+(const|let|function|class|async function)\s+(\w+)/gm, (_, kw, name) => {
    exportNames.push(name);
    return `${kw} ${name}`;
  });
  code = code.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_, names) => {
    names.split(',').map((n) => n.trim()).filter(Boolean).forEach((n) => exportNames.push(n));
    return '';
  });
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`Unhandled import/export in ${rel}`);
  modules.set(rel, { code, deps, exportNames });
  deps.forEach(load);
}
load(ENTRY);

// topological order
const order = [];
const seen = new Set();
function visit(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  modules.get(rel).deps.forEach(visit);
  order.push(rel);
}
visit(ENTRY);

const body = order
  .map((rel) => {
    const m = modules.get(rel);
    return `// ---- ${rel}\n__mods[${JSON.stringify(rel)}] = (() => {\n${m.code}\nreturn { ${m.exportNames.join(', ')} };\n})();`;
  })
  .join('\n');

let html = readFileSync(join(root, 'web/index.html'), 'utf8');
const css = readFileSync(join(root, 'web/styles.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="app.js"></script>', () => `<script>\n(() => {\n'use strict';\nconst __mods = {};\n${body}\n})();\n</script>`);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/edm800-simulator.html'), html);
console.log(`dist/edm800-simulator.html  ${(html.length / 1024).toFixed(0)} KB, ${order.length} modules`);
