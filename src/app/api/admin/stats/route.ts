import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Internal admin endpoint — returns payment/job stats
// Protected by INTERNAL_KEY header
export async function GET(req: NextRequest) {
  const key = req.headers.get('x-internal-key');
  const expectedKey = process.env.INTERNAL_KEY || 'dev';
  if (key !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_jobs,
      SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) as paid_jobs,
      SUM(CASE WHEN paid = 1 THEN amount_cents ELSE 0 END) as revenue_cents,
      SUM(CASE WHEN status = 'done' THEN leads_found ELSE 0 END) as leads_delivered,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_jobs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs
    FROM jobs
  `).get() as {
    total_jobs: number;
    paid_jobs: number;
    revenue_cents: number;
    leads_delivered: number;
    running_jobs: number;
    failed_jobs: number;
  };

  const recent = db.prepare(`
    SELECT id, status, amount_cents, lead_count_requested, leads_found,
           icp_job_titles, icp_industries, created_at
    FROM jobs WHERE paid = 1 ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{
    id: string;
    status: string;
    amount_cents: number;
    lead_count_requested: number;
    leads_found: number;
    icp_job_titles: string | null;
    icp_industries: string | null;
    created_at: number;
  }>;

  return NextResponse.json({
    stats: {
      total_jobs: totals.total_jobs,
      paid_jobs: totals.paid_jobs,
      revenue_usd: ((totals.revenue_cents || 0) / 100).toFixed(2),
      leads_delivered: totals.leads_delivered || 0,
      running_jobs: totals.running_jobs || 0,
      failed_jobs: totals.failed_jobs || 0,
    },
    recent_paid: recent.map(j => ({
      id: j.id.slice(0, 8),
      status: j.status,
      amount_usd: (j.amount_cents / 100).toFixed(2),
      leads_requested: j.lead_count_requested,
      leads_found: j.leads_found,
      icp: [j.icp_job_titles, j.icp_industries].filter(Boolean).join(' / '),
      created_at: new Date(j.created_at * 1000).toISOString(),
    })),
  });
}
