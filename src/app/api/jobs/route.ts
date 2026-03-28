import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createCheckoutSession, calculateJobPrice } from '@/lib/stripe';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      email,
      company_size,
      industries,
      job_titles,
      geo,
      lead_count = 25,
    } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    if (lead_count < 5 || lead_count > 200) {
      return NextResponse.json({ error: 'lead_count must be between 5 and 200' }, { status: 400 });
    }

    const db = getDb();

    // Upsert user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as { id: string } | undefined;
    if (!user) {
      const userId = randomUUID();
      db.prepare('INSERT INTO users (id, email) VALUES (?, ?)').run(userId, email);
      user = { id: userId };
    }

    // Create job
    const jobId = randomUUID();
    db.prepare(`
      INSERT INTO jobs (id, user_id, status, icp_company_size, icp_industries, icp_job_titles, icp_geo, lead_count_requested, amount_cents)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    `).run(
      jobId,
      user.id,
      company_size || null,
      industries?.length ? JSON.stringify(industries) : null,
      job_titles?.length ? JSON.stringify(job_titles) : null,
      geo || null,
      lead_count,
      calculateJobPrice(lead_count),
    );

    // Create Stripe checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const checkoutUrl = await createCheckoutSession({
      jobId,
      leadCount: lead_count,
      userEmail: email,
      appUrl,
    });

    return NextResponse.json({ jobId, checkoutUrl, amount: calculateJobPrice(lead_count) });

  } catch (err) {
    console.error('POST /api/jobs error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ jobs: [] });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (!user) return NextResponse.json({ jobs: [] });

  const jobs = db.prepare(`
    SELECT id, status, icp_company_size, icp_industries, icp_job_titles, icp_geo,
           lead_count_requested, leads_found, error, paid, amount_cents, created_at, updated_at
    FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(user.id);

  return NextResponse.json({ jobs });
}
