import 'dotenv/config';
import { getDb } from '../lib/db';
import { runPipeline } from '../lib/pipeline/runner';

const POLL_INTERVAL_MS = 10_000; // 10 seconds

async function pollAndProcess() {
  const db = getDb();

  const job = db.prepare(`
    SELECT id FROM jobs WHERE status = 'paid' ORDER BY created_at ASC LIMIT 1
  `).get() as { id: string } | undefined;

  if (!job) return;

  console.log(`[Worker] Processing job ${job.id}`);
  try {
    await runPipeline(job.id);
    console.log(`[Worker] Job ${job.id} complete`);
  } catch (e) {
    console.error(`[Worker] Job ${job.id} failed:`, e);
  }
}

async function main() {
  console.log('[Worker] Polling for paid jobs every', POLL_INTERVAL_MS / 1000, 'seconds...');

  while (true) {
    try {
      await pollAndProcess();
    } catch (e) {
      console.error('[Worker] Poll error:', e);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch(console.error);
