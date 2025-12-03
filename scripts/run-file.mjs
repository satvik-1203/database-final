#!/usr/bin/env node

/**
 * Run a single input file through the simulator with pretty headers.
 * Usage:
 *   npm run test-file -- <relative-path>
 * Example:
 *   npm run test-file -- ./tests/input24.txt
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const args = process.argv.slice(2);
const inputPath = args[0];

if (!inputPath) {
  console.error('Usage: npm run test-file -- <relative-path>');
  process.exit(1);
}

const absPath = resolve(process.cwd(), inputPath);

// Build first
console.log('Building project...\n');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (err) {
  console.error('Build failed.');
  process.exit(1);
}

// Read file and stream to simulator via stdin while printing headers on markers
let content;
try {
  content = readFileSync(absPath, 'utf8');
} catch (err) {
  console.error(`Could not read file: ${absPath}`);
  process.exit(1);
}

// Split into segments by test markers and run each segment separately
const lines = content.split('\n');
const testMarker = /^\s*\/\/\s*test\s*(\d+(?:\.\d+)?)/i;

const segments = [];
let current = { name: null, lines: [] };

for (const line of lines) {
  const m = line.match(testMarker);
  if (m) {
    // flush previous
    if (current.lines.length > 0) {
      segments.push(current);
      current = { name: null, lines: [] };
    }
    // start new named segment; do not include the comment line itself
    current.name = m[1];
    continue;
  }
  current.lines.push(line);
}
if (current.lines.length > 0) {
  segments.push(current);
}

if (segments.length === 0) {
  // No content; nothing to run
  process.exit(0);
}

for (const seg of segments) {
  if (seg.name) {
    console.log(`\n============== TEST ${seg.name} ===============\n`);
  }
  const inputText = seg.lines.join('\n') + '\n';
  const res = spawnSync('node', ['dist/index.js', '-'], {
    input: inputText,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

process.exit(0);


