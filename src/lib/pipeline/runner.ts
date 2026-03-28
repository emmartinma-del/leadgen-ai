import { getDb } from '../db';
import { scrapeLeads, type ICP } from './scraper';
import { enrichLeads } from './enricher';
import { randomUUID } from 'crypto';

export async function runPipeline(jobId: string): Promise<void> {
  const db = getDb();

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as {
    id: string;
    icp_company_size: string;
    icp_industries: string;
    icp_job_titles: string;
    icp_geo: string;
    lead_count_requested: number;
  } | undefined;

  if (!job) throw new Error(`Job ${jobId} not found`);

  // Mark running
  db.prepare(`UPDATE jobs SET status = 'running', updated_at = unixepoch() WHERE id = ?`).run(jobId);

  try {
    const icp: ICP = {
      company_size: job.icp_company_size,
      industries: job.icp_industries ? JSON.parse(job.icp_industries) : [],
      job_titles: job.icp_job_titles ? JSON.parse(job.icp_job_titles) : [],
      geo: job.icp_geo,
      lead_count: job.lead_count_requested,
    };

    console.log(`[Pipeline] Job ${jobId}: scraping ${job.lead_count_requested} leads for ICP:`, icp);

    // Step 1: Scrape
    const rawLeads = await scrapeLeads(icp, job.lead_count_requested);
    console.log(`[Pipeline] Job ${jobId}: scraped ${rawLeads.length} raw leads`);

    // Step 2: Enrich with LLM
    const enrichedLeads = await enrichLeads(rawLeads, icp);
    console.log(`[Pipeline] Job ${jobId}: enriched ${enrichedLeads.length} leads`);

    // Step 3: Save to DB, sorted by score desc
    const sorted = enrichedLeads.sort((a, b) => b.score - a.score);

    const insertLead = db.prepare(`
      INSERT INTO leads (
        id, job_id, full_name, first_name, last_name, email, linkedin_url,
        job_title, company_name, company_website, company_size, industry,
        location, pain_signals, recent_activity, score, score_reason, source, enriched
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, 1
      )
    `);

    // node:sqlite doesn't have .transaction() — use BEGIN/COMMIT manually
    db.exec('BEGIN');
    try {
      for (const lead of sorted) {
        insertLead.run(
          randomUUID(),
          jobId,
          lead.full_name ?? null,
          lead.first_name ?? null,
          lead.last_name ?? null,
          lead.email ?? null,
          lead.linkedin_url ?? null,
          lead.job_title ?? null,
          lead.company_name ?? null,
          lead.company_website ?? null,
          lead.company_size ?? null,
          lead.industry ?? null,
          lead.location ?? null,
          lead.pain_signals ?? null,
          lead.recent_activity ?? null,
          lead.score,
          lead.score_reason ?? null,
          lead.source,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    db.prepare(`
      UPDATE jobs SET status = 'done', leads_found = ?, updated_at = unixepoch() WHERE id = ?
    `).run(sorted.length, jobId);

    console.log(`[Pipeline] Job ${jobId}: DONE — ${sorted.length} leads saved`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Job ${jobId}: FAILED — ${message}`);
    db.prepare(`
      UPDATE jobs SET status = 'failed', error = ?, updated_at = unixepoch() WHERE id = ?
    `).run(message, jobId);
    throw err;
  }
}
