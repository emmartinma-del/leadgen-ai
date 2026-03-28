import Anthropic from '@anthropic-ai/sdk';
import type { RawLead, ICP } from './scraper';

export interface EnrichedLead extends RawLead {
  pain_signals: string;
  recent_activity: string;
  score: number;
  score_reason: string;
  email?: string;
}

// Rules-based fallback enrichment (no LLM required)
function rulesBasedEnrich(leads: RawLead[], icp: ICP): EnrichedLead[] {
  const targetTitles = (icp.job_titles || []).map(t => t.toLowerCase());
  const targetIndustries = (icp.industries || []).map(i => i.toLowerCase());

  const TITLE_PAIN_MAP: Record<string, string> = {
    'cto': 'Managing technical debt, scaling infrastructure, recruiting senior engineers',
    'vp engineering': 'Scaling the eng team, reducing time-to-deploy, managing architectural debt',
    'vp sales': 'Pipeline coverage gaps, SDR ramp time, CRM data quality issues',
    'head of sales': 'Inconsistent outbound results, low lead quality, manual prospecting overhead',
    'ceo': 'Revenue predictability, burn rate control, go-to-market efficiency',
    'founder': 'Finding first customers, building initial pipeline, product-market fit validation',
    'head of marketing': 'MQL to SQL conversion gaps, rising CAC, attribution complexity',
    'cmo': 'Proving marketing ROI, demand gen efficiency, brand differentiation',
    'head of product': 'Prioritization under pressure, customer discovery gaps, feature adoption',
    'growth': 'Top-of-funnel volume, activation rates, referral loop mechanics',
    'revenue ops': 'CRM hygiene, forecasting accuracy, sales-marketing alignment',
    'sdr': 'Contact data quality, personalization at scale, response rate optimization',
    'bdr': 'Finding qualified prospects, email deliverability, booking meetings consistently',
  };

  return leads.map(lead => {
    const title = (lead.job_title || '').toLowerCase();
    const industry = (lead.industry || '').toLowerCase();

    // Score based on ICP match
    let score = 50;
    const reasons: string[] = [];

    if (targetTitles.some(t => title.includes(t) || t.includes(title.split(' ')[0]))) {
      score += 25;
      reasons.push('title matches ICP');
    }
    if (targetIndustries.some(i => industry.includes(i))) {
      score += 15;
      reasons.push('industry match');
    }
    if (lead.linkedin_url) { score += 5; reasons.push('LinkedIn verified'); }
    if (lead.email) { score += 5; reasons.push('email available'); }

    const painKey = Object.keys(TITLE_PAIN_MAP).find(k => title.includes(k));
    const pain_signals = painKey
      ? TITLE_PAIN_MAP[painKey]
      : `Operational efficiency, team scaling, and competitive pressure typical for ${title || 'this role'}`;

    return {
      ...lead,
      pain_signals,
      recent_activity: 'No LLM enrichment — rules-based scoring applied',
      score: Math.min(99, score),
      score_reason: reasons.length > 0 ? reasons.join(', ') : 'Baseline ICP proximity score',
    };
  });
}

// Batch enrich leads using Claude
export async function enrichLeads(leads: RawLead[], icp: ICP): Promise<EnrichedLead[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Enricher] No Anthropic key — using rules-based enrichment');
    return rulesBasedEnrich(leads, icp);
  }

  const enriched: EnrichedLead[] = [];

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    try {
      const batchResults = await enrichBatch(batch, icp);
      enriched.push(...batchResults);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Fall back to rules-based for this batch on rate limit or error
      if (msg.includes('rate') || msg.includes('limit') || msg.includes('quota') || msg.includes('usage')) {
        console.warn('[Enricher] Anthropic rate limit hit — falling back to rules-based for this batch');
        enriched.push(...rulesBasedEnrich(batch, icp));
      } else {
        throw e;
      }
    }
  }

  return enriched;
}

async function enrichBatch(leads: RawLead[], icp: ICP): Promise<EnrichedLead[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
