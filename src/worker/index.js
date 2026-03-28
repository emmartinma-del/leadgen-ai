#!/usr/bin/env node
/**
 * Standalone pipeline worker — polls for paid jobs and processes them.
 * Useful for running separately from Next.js in production.
 * Usage: node src/worker/index.js
 */

require('dotenv').config();

// Use tsx/ts-node for TypeScript, or pre-compile
// This file wraps the TS pipeline via a small shim
const { execSync } = require('child_process');

async function main() {
  console.log('[Worker] Starting pipeline worker...');
  // The worker logic is in TypeScript — run it via tsx
  try {
    execSync('npx tsx src/worker/worker.ts', { stdio: 'inherit' });
  } catch (e) {
    console.error('[Worker] Failed to start worker:', e.message);
    process.exit(1);
  }
}

main();
