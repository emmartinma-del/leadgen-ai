import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline/runner';

// Internal endpoint — triggered by Stripe webhook after payment
// In production, use a proper job queue (Bull, inngest, etc.)
export async function POST(req: NextRequest) {
  const internalKey = req.headers.get('x-internal-key');
  const expectedKey = process.env.INTERNAL_KEY || 'dev';

  if (internalKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await req.json();
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  // Run pipeline async (don't await — respond immediately)
  runPipeline(jobId).catch(e => console.error(`Pipeline failed for ${jobId}:`, e));

  return NextResponse.json({ started: true, jobId });
}
