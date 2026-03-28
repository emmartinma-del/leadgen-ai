import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { stringify } from 'csv-stringify/sync';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();

  const job = db.prepare('SELECT id, status, paid FROM jobs WHERE id = ?').get(params.id) as {
    id: string;
    status: string;
    paid: number;
  } | undefined;

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!job.paid) return NextResponse.json({ error: 'Payment required' }, { status: 402 });
  if (job.status !== 'done') return NextResponse.json({ error: 'Job not complete' }, { status: 400 });

  const leads = db.prepare(`
    SELECT full_name, first_name, last_name, email, linkedin_url, job_title,
           company_name, company_website, company_size, industry, location,
           pain_signals, recent_activity, score, score_reason, source
    FROM leads WHERE job_id = ? ORDER BY score DESC
  `).all(params.id) as Record<string, unknown>[];

  const csv = stringify(leads, {
    header: true,
    columns: [
      'full_name', 'first_name', 'last_name', 'email', 'linkedin_url',
      'job_title', 'company_name', 'company_website', 'company_size', 'industry',
      'location', 'pain_signals', 'recent_activity', 'score', 'score_reason', 'source',
    ],
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="leads-${params.id}.csv"`,
    },
  });
}
