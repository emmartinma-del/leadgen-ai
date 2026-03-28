import Anthropic from '@anthropic-ai/sdk';
import type { RawLead } from './scraper';
import type { ICP } from './scraper';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface EnrichedLead extends RawLead {
  pain_signals: string;
  recent_activity: string;
  score: number;
  score_reason: string;
  email?: string;
}

// Batch enrich leads using Claude
export async function enrichLeads(leads: RawLead[], icp: ICP): Promise<EnrichedLead[]> {
  const enriched: EnrichedLead[] = [];

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const batchResults = await enrichBatch(batch, icp);
    enriched.push(...batchResults);
  }

  return enriched;
}

async function enrichBatch(leads: RawLead[], icp: ICP): Promise<EnrichedLead[]> {
  const leadsJson = JSON.stringify(leads.map((l, idx) => ({
    idx,
    name: l.full_name,
    title: l.job_title,
    company: l.company_name,
    website: l.company_website,
    location: l.location,
    linkedin: l.linkedin_url,
    industry: l.industry,
  })));

  const icpDesc = [
    icp.industries?.length ? `Industries: ${icp.industries.join(', ')}` : '',
    icp.job_titles?.length ? `Target roles: ${icp.job_titles.join(', ')}` : '',
    icp.company_size ? `Company size: ${icp.company_size} employees` : '',
    icp.geo ? `Geography: ${icp.geo}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `You are a B2B sales intelligence analyst. Given these leads and the target ICP, enrich each lead.

ICP (Ideal Customer Profile):
${icpDesc}

Leads to enrich (JSON):
${leadsJson}

For each lead, provide:
1. pain_signals: 2-3 specific pain points this person likely has based on their role/company (be specific and actionable)
2. recent_activity: inferred recent business activity or trigger events (funding, hiring surge, product launch, etc.)
3. score: lead quality score 1-100 based on ICP fit
4. score_reason: one sentence explaining the score
5. email_pattern: most likely work email (e.g. firstname.lastname@company.com or firstname@company.com) based on company website domain

Return ONLY a JSON array with objects: { idx, pain_signals, recent_activity, score, score_reason, email_pattern }
No markdown, no explanation. Pure JSON array.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');

    let enrichments: Array<{
      idx: number;
      pain_signals: string;
      recent_activity: string;
      score: number;
      score_reason: string;
      email_pattern: string;
    }>;

    try {
      const text = content.text.trim();
      // Strip markdown code blocks if present
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      enrichments = JSON.parse(cleaned);
    } catch {
      // If parsing fails, return leads with default enrichment
      return leads.map(l => ({
        ...l,
        pain_signals: 'Unable to analyze at this time',
        recent_activity: 'No recent activity data',
        score: 50,
        score_reason: 'Default score - enrichment unavailable',
      }));
    }

    return leads.map((lead, idx) => {
      const enrichment = enrichments.find(e => e.idx === idx) || {
        pain_signals: '',
        recent_activity: '',
        score: 50,
        score_reason: 'Score unavailable',
        email_pattern: '',
      };

      // Build email from pattern
      let email: string | undefined;
      if (enrichment.email_pattern && enrichment.email_pattern.includes('@')) {
        email = enrichment.email_pattern
          .replace('{firstname}', (lead.first_name || '').toLowerCase())
          .replace('{lastname}', (lead.last_name || '').toLowerCase())
          .replace('{first}', (lead.first_name || '').toLowerCase())
          .replace('{last}', (lead.last_name || '').toLowerCase());
        if (!email.includes('@')) email = undefined;
      }

      return {
        ...lead,
        email: email || lead.email,
        pain_signals: enrichment.pain_signals,
        recent_activity: enrichment.recent_activity,
        score: Math.min(100, Math.max(1, enrichment.score || 50)),
        score_reason: enrichment.score_reason,
      };
    });

  } catch (e) {
    console.error('Enrichment batch failed:', e);
    return leads.map(l => ({
      ...l,
      pain_signals: 'Enrichment failed',
      recent_activity: '',
      score: 40,
      score_reason: 'Enrichment error',
    }));
  }
}
