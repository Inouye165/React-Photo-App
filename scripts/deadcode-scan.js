const fs = require('fs');
const path = require('path');

const workspace = process.cwd();
const exts = ['.js', '.jsx', '.cjs', '.mjs'];

function listFiles() {
  const { execSync } = require('child_process');
  const out = execSync("git ls-files '*.js' '*.jsx' '*.cjs' '*.mjs'", { encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function isRelativeImport(p) {
  return p.startsWith('./') || p.startsWith('../') || p.startsWith('/');
}

function resolveImport(fromFile, importPath) {
  if (!isRelativeImport(importPath)) return null;
  const base = path.dirname(fromFile);
  const candidate = path.resolve(workspace, base, importPath);
  // try extensions
  for (const e of exts) {
    const f = candidate + e;
    if (fs.existsSync(f)) return path.relative(workspace, f).replace(/\\/g, '/');
  }
  // try index files
  for (const e of exts) {
    const f = path.join(candidate, 'index' + e);
    if (fs.existsSync(f)) return path.relative(workspace, f).replace(/\\/g, '/');
  }
  // raw path with extension
  if (fs.existsSync(candidate)) return path.relative(workspace, candidate).replace(/\\/g, '/');
  return null;
}

function parseImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = new Set();
  // ES imports
  const importRe = /import\s+(?:[^'"\n]+)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(content))) imports.add(m[1]);
  // import('...') dynamic
  const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(content))) imports.add(m[1]);
  // require('...')
  const reqRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reqRe.exec(content))) imports.add(m[1]);
  return Array.from(imports);
}

function main() {
  const files = listFiles();
  const absFiles = files.map(f => f);
  const graph = {};
  for (const f of absFiles) graph[f] = { out: new Set(), in: new Set() };

  for (const f of absFiles) {
    const full = path.resolve(workspace, f);
    let imports = [];
    try { imports = parseImports(full); } catch { continue; }
    for (const imp of imports) {
      const resolved = resolveImport(f, imp);
      if (resolved && graph[resolved]) {
        graph[f].out.add(resolved);
        graph[resolved].in.add(f);
      }
    }
  }

  // Known entry points and files to ignore
  const entryPoints = new Set(['server/server.js','server/worker.js','src/main.jsx','vite.config.js']);
  const keepPatterns = [/server\/db\/migrations\//, /server\/tests\//, /tests\//, /^dist\//, /^public\//, /^docs\//, /vitest.config.js/];

  const candidates = [];
  for (const f of Object.keys(graph)) {
    if (entryPoints.has(f)) continue;
    if (graph[f].in.size === 0) {
      // check keep patterns
      const skip = keepPatterns.some(re => re.test(f));
      candidates.push({ file: f, incoming: graph[f].in.size, skip });
    }
  }

  // sort by simple heuristic: skip last
  candidates.sort((a,b) => (a.skip === b.skip) ? a.file.localeCompare(b.file) : (a.skip?1:-1));

  console.log('Dead-code scan results:');
  console.log('Format: file (incoming refs) [skip-reason-if-any]');
  for (const c of candidates) {
    console.log(`${c.file} (${c.incoming})${c.skip ? ' [skip-pattern]' : ''}`);
  }
}

main();
