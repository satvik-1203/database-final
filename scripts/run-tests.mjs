#!/usr/bin/env node

/**
 * Test runner script for running test cases
 */

import { execSync } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const testIdArg = args.find(arg => arg.startsWith('--id='));
const testId = testIdArg ? testIdArg.split('=')[1] : null;

const testsDir = join(process.cwd(), 'tests');

if (!existsSync(testsDir)) {
  console.error('Tests directory not found!');
  process.exit(1);
}

// Build first
console.log('Building project...\n');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed!');
  process.exit(1);
}

if (testId) {
  // Run specific test
  const testFile = join(testsDir, `input${testId}.txt`);
  
  if (!existsSync(testFile)) {
    console.error(`Test file input${testId}.txt not found!`);
    process.exit(1);
  }
  
  console.log(`\n=== Running Test ${testId} (${testFile}) ===\n`);
  try {
    execSync(`node dist/index.js "${testFile}"`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`\nTest ${testId} failed!`);
    process.exit(1);
  }
} else {
  // Run all tests
  const testFiles = readdirSync(testsDir)
    .filter(file => file.startsWith('input') && file.endsWith('.txt'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0');
      const numB = parseInt(b.match(/\d+/)?.[0] || '0');
      return numA - numB;
    });
  
  if (testFiles.length === 0) {
    console.error('No test files found!');
    process.exit(1);
  }
  
  console.log(`\nRunning ${testFiles.length} test(s)...\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (const testFile of testFiles) {
    const testPath = join(testsDir, testFile);
    const testNum = testFile.match(/\d+/)?.[0] || '?';
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Test ${testNum}: ${testFile} ===`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      execSync(`node dist/index.js "${testPath}"`, { stdio: 'inherit' });
      passed++;
    } catch (error) {
      console.error(`\n✗ Test ${testNum} failed!`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('=== Test Summary ===');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total: ${testFiles.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
}


