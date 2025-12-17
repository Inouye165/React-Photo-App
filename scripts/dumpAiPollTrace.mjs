import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const outPath = path.join(repoRoot, 'AI_POLL_TRACE_OUTPUT.txt');

const template = `AI Poll Trace Output

This file is a paste target for the browser-side AI polling trace.

Repro steps
1) Enable debug in the browser:
   - DevTools console: localStorage.setItem('debug_ai_poll','1'); location.reload();
   - OR build-time: VITE_DEBUG_AI_POLL=1
2) Reproduce the stuck "Analyzing..." behavior.
3) Export the trace:
   - DevTools console: copy(window.dumpAiPollTrace())
4) Paste the copied JSON below.

PASTE dumpAiPollTrace() HERE

`;

await fs.writeFile(outPath, template, 'utf8');

console.log('Created AI_POLL_TRACE_OUTPUT.txt at:', outPath);
console.log('Next: paste browser output from window.dumpAiPollTrace() into that file.');
