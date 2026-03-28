import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getDb } from '@/lib/db';
import Stripe from 'stripe';

// Kick off the pipeline in a non-blocking way
async function triggerPipeline(jobId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    // Self-call the internal pipeline trigger endpoint
    await fetch(`${appUrl}/api/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_KEY || 'dev' },
      body: JSON.stringify({ jobId }),
    });
  } catch (e) {
    console.error('Failed to trigger pipeline for job', jobId, e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Dev mode: allow unsigned webhooks
    console.warn('Stripe webhook received without signature — dev mode');
    try {
      const event = JSON.parse(body) as Stripe.Event;
      await handleEvent(event);
    } catch (e) {
      console.error('Failed to parse webhook body:', e);
    }
    return NextResponse.json({ received: true });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  await handleEvent(event);
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  const db = getDb();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const jobId = session.metadata?.jobId;

    if (!jobId) return;

    // Mark job as paid and queue for processing
    db.prepare(`
      UPDATE jobs
      SET paid = 1, stripe_session_id = ?, status = 'paid', updated_at = unixepoch()
      WHERE id = ?
    `).run(session.id, jobId);

    console.log(`[Stripe] Payment confirmed for job ${jobId} — triggering pipeline`);

    // Trigger pipeline (fire-and-forget)
    triggerPipeline(jobId);
  }
}
