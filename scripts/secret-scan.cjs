#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getStagedFiles() {
  try {
    // Only scan files that will exist in the commit (skip deletions).
    const out = execSync('git diff --cached --name-only --no-renames --diff-filter=ACMR', { encoding: 'utf8' });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (err) {
    // Not a git repo or git failed — be permissive
    return [];
  }
}

function getFileContentFromIndex(file) {
  try {
    // Use git show to read the staged version of the file
    return execSync(`git show :"${file}"`, { encoding: 'utf8' });
  } catch (err) {
    // Fall back to reading from disk
    try { return fs.readFileSync(path.resolve(file), 'utf8'); } catch { return null; }
  }
}

// Avoid scanning the scanner itself (it contains the patterns by design).
const ignoredFiles = new Set(['scripts/secret-scan.cjs']);

// List of regex checks for common secret patterns
const checks = [
  { name: 'OpenAI secret', re: /sk-[A-Za-z0-9-_]{20,}/i },
  // Only flag when a value is present, not when code merely references env var names.
  {
    name: 'Supabase key assignment',
    re: /SUPABASE_(SERVICE_ROLE_KEY|ANON_KEY|STORAGE_SECRET_KEY)\s*=\s*['"][^'\"]{20,}['"]/i,
  },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  // Only flag an actual secret value assignment (40 chars base64-ish), not the identifier.
  { name: 'AWS secret assignment', re: /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9\/+]{40}['"]?/i },
  { name: 'GH token', re: /ghp_[A-Za-z0-9_]{36}/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/i },
  { name: 'Private key block', re: /-----BEGIN (RSA|OPENSSH|PRIVATE) KEY-----/ },
  { name: 'JWT secret in plain', re: /JWT_SECRET\s*=\s*['\"]?[A-Za-z0-9\-_=]{8,}['\"]?/i },
  { name: 'Generic secret assignment', re: /(secret|password|api_key|apikey|token)\s*=\s*['\"][^'\"]{6,}['\"]/i },
];

function scanContent(content) {
  const matches = [];
  if (!content) return matches;
  for (const c of checks) {
    if (c.re.test(content)) matches.push(c.name);
  }
  return matches;
}

function main() {
  const files = getStagedFiles();
  if (files.length === 0) {
    // Nothing staged: pass
    process.exit(0);
  }

  const findings = [];
  for (const file of files) {
    if (ignoredFiles.has(file)) continue;
    const content = getFileContentFromIndex(file);
    const matched = scanContent(content);
    if (matched.length > 0) {
      findings.push({ file, matched });
    }
  }

  if (findings.length > 0) {
    console.error('\nSecret scan failed — potential secrets detected in staged files:');
    for (const f of findings) {
      console.error(`  - ${f.file}: ${f.matched.join(', ')}`);
    }
    console.error('\nIf these are false positives, either remove the secret from the commit or add an explicit allowlisting change (not recommended).');
    process.exit(1);
  }

  process.exit(0);
}

main();
