import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const job = db.prepare(`
    SELECT id, status, icp_company_size, icp_industries, icp_job_titles, icp_geo,
           lead_count_requested, leads_found, error, paid, amount_cents, created_at, updated_at
    FROM jobs WHERE id = ?
  `).get(params.id);

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ job });
}
