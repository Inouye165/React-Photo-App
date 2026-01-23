const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const exts = ['.js', '.jsx', '.ts', '.tsx'];

function walk(dir) {
  const res = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (rel.startsWith('server/') || rel.includes('node_modules') || rel.startsWith('coverage/') ) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) res.push(...walk(full));
    else if (exts.includes(path.extname(name))) res.push(full);
  }
  return res;
}

const files = walk(ROOT);

const importRe = /(?:from\s+['"]([^'"\\)]+)['"])|(?:require\(['"]([^'"\\)]+)['"]\))/g;

function resolveImport(fromFile, spec) {
  if (spec.startsWith('.') ) {
    const cand = path.resolve(path.dirname(fromFile), spec);
    for (const e of exts) {
      const p = cand + e;
      if (fs.existsSync(p)) return path.relative(ROOT, p).split(path.sep).join('/');
    }
    // index files
    for (const e of exts) {
      const p = path.join(cand, 'index' + e);
      if (fs.existsSync(p)) return path.relative(ROOT, p).split(path.sep).join('/');
    }
    // fallback to file as-is
    return path.relative(ROOT, cand).split(path.sep).join('/');
  }
  return null; // ignore external packages
}

const outgoing = {};
const incoming = {};

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  outgoing[rel] = outgoing[rel] || new Set();
  incoming[rel] = incoming[rel] || new Set();
}

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const content = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    const resolved = resolveImport(f, spec);
    if (resolved) {
      outgoing[rel].add(resolved);
      incoming[resolved] = incoming[resolved] || new Set();
      incoming[resolved].add(rel);
    }
  }
}

const results = Object.keys(incoming).map(f => ({
  file: f,
  incoming: incoming[f] ? incoming[f].size : 0,
  outgoing: outgoing[f] ? outgoing[f].size : 0,
}));

results.sort((a,b) => b.incoming - a.incoming || a.outgoing - b.outgoing || a.file.localeCompare(b.file));

console.log('Top candidates (JS/JSX only):');
for (const r of results.filter(r => r.file.endsWith('.js') || r.file.endsWith('.jsx')).slice(0, 30)) {
  console.log(`${r.file}  incoming=${r.incoming} outgoing=${r.outgoing}`);
}

// print top overall too
console.log('\nTop overall:');
for (const r of results.slice(0,30)) console.log(`${r.file}  incoming=${r.incoming} outgoing=${r.outgoing}`);

process.exit(0);
