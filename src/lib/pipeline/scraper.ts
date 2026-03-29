import axios from 'axios';
import * as cheerio from 'cheerio';

export interface RawLead {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_title?: string;
  company_name?: string;
  company_website?: string;
  linkedin_url?: string;
  location?: string;
  industry?: string;
  company_size?: string;
  source: string;
}

export interface ICP {
  company_size?: string;
  industries?: string[];
  job_titles?: string[];
  geo?: string;
  lead_count?: number;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Source 1: GitHub API (great for tech leads: CTOs, VPs Eng, Developers) ──
const TECH_TITLES = ['cto', 'vp engineering', 'head of engineering', 'chief technology', 'software engineer',
  'developer', 'engineer', 'architect', 'technical lead', 'principal', 'founder', 'cofounder', 'co-founder'];

function isTechTitle(titles: string[]): boolean {
  return titles.some(t => TECH_TITLES.some(tt => t.toLowerCase().includes(tt)));
}

async function scrapeGitHub(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const titles = icp.job_titles || [];
  const geo = icp.geo || '';

  // Build search query
  const queries: string[] = [];
  for (const title of titles.slice(0, 3)) {
    let q = `"${title}" in:bio followers:>20`;
    if (geo) q += ` location:${geo.split(' ')[0]}`;
    queries.push(q);
  }
  // Also try company/bio keywords
  if (icp.industries?.length) {
    queries.push(`${icp.industries[0]} in:bio followers:>50`);
  }

  for (const query of queries) {
    if (leads.length >= count) break;
    try {
      const res = await axios.get('https://api.github.com/search/users', {
        params: { q: query, per_page: Math.min(30, count * 2), sort: 'followers' },
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'LeadGenBot/1.0',
        },
        timeout: 10000,
      });

      const users: Array<{ login: string; url: string }> = res.data.items || [];

      for (const user of users.slice(0, Math.ceil(count / queries.length) + 5)) {
        if (leads.length >= count) break;
        try {
          const profile = await axios.get(`https://api.github.com/users/${user.login}`, {
            headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'LeadGenBot/1.0' },
            timeout: 8000,
          });
          const p = profile.data;
          if (!p.name && !p.login) continue;

          const name = p.name || p.login;
          const parts = name.trim().split(' ');
          const website = p.blog ? (p.blog.startsWith('http') ? p.blog : `https://${p.blog}`) : undefined;

          // Infer job title from bio
          let jobTitle = '';
          if (p.bio) {
            const bioLower = p.bio.toLowerCase();
            for (const t of titles) {
              if (bioLower.includes(t.toLowerCase())) { jobTitle = t; break; }
            }
            if (!jobTitle) {
              const match = p.bio.match(/^([^|@\n,]+)/);
              if (match) jobTitle = match[1].trim().slice(0, 60);
            }
          }

          leads.push({
            full_name: name,
            first_name: parts[0],
            last_name: parts.slice(1).join(' ') || undefined,
            email: p.email || undefined,
            job_title: jobTitle || titles[0],
            company_name: p.company ? p.company.replace(/^@/, '') : undefined,
            company_website: website,
            location: p.location || geo || undefined,
            source: 'github',
          });
          await sleep(300);
        } catch { continue; }
      }
      await sleep(1000);
    } catch (e) {
      console.warn('[Scraper] GitHub search failed:', e instanceof Error ? e.message : String(e));
    }
  }
  return leads;
}

// ── Source 2: DuckDuckGo HTML scraping → company websites → team pages ──
async function webSearch(query: string): Promise<string[]> {
  try {
    // Use DuckDuckGo HTML interface — returns real URLs without redirect wrappers
    const res = await axios.get('https://html.duckduckgo.com/html/', {
      params: { q: query },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);
    const urls: string[] = [];

    $('a.result__url, a.result__a').each((_, el) => {
      const href = $(el).attr('href') || '';
      // DDG wraps URLs in redirect: extract actual URL from uddg param
      const match = href.match(/uddg=([^&]+)/);
      if (match) {
        try { urls.push(decodeURIComponent(match[1])); } catch { /* skip */ }
      } else if (href.startsWith('http') && !href.includes('duckduckgo.com')) {
        urls.push(href);
      }
    });

    return Array.from(new Set(urls)).slice(0, 15);
  } catch {
    return [];
  }
}

async function scrapeCompanyLeads(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const titles = icp.job_titles || ['CEO', 'CTO', 'VP Sales'];
  const industries = icp.industries || [];
  const geo = icp.geo || '';

  // Search for companies in the target industry
  const query = [
    industries.length ? `"${industries[0]}" company` : 'SaaS company',
    titles[0] ? `"${titles[0]}"` : '',
    geo,
    'team leadership',
  ].filter(Boolean).join(' ');

  const companyUrls = await webSearch(query);
  const companyRoots = companyUrls
    .filter(u => {
      try { return !u.includes('linkedin.com') && !u.includes('glassdoor') && !u.includes('wikipedia'); }
      catch { return false; }
    })
    .map(u => { try { return new URL(u).origin; } catch { return null; } })
    .filter((u): u is string => !!u);

  const uniqueRoots = Array.from(new Set(companyRoots)).slice(0, 8);

  for (const root of uniqueRoots) {
    if (leads.length >= count) break;
    const teamPaths = ['/team', '/about', '/about-us', '/leadership', '/people', '/our-team'];
    for (const path of teamPaths.slice(0, 2)) {
      try {
        const url = root + path;
        const res = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGenBot/1.0)' },
          timeout: 6000,
        });
        const $ = cheerio.load(res.data);
        const domain = new URL(root).hostname.replace('www.', '');
        const industry = industries[0] || '';

        $('[class*="team"], [class*="member"], [class*="person"], [class*="staff"], [class*="leadership"]').each((_, el) => {
          const name = $(el).find('h2, h3, h4, [class*="name"]').first().text().trim();
          const title = $(el).find('p, [class*="title"], [class*="role"], [class*="position"]').first().text().trim();

          if (!name || name.length < 3 || name.length > 60) return;
          const matchesICP = titles.length === 0 || titles.some(t =>
            title.toLowerCase().includes(t.toLowerCase().split(' ')[0])
          );
          if (!matchesICP && leads.length > 0) return;

          const parts = name.split(' ');
          leads.push({
            full_name: name,
            first_name: parts[0],
            last_name: parts.slice(1).join(' ') || undefined,
            job_title: title || titles[0],
            company_name: domain,
            company_website: root,
            industry,
            location: geo || undefined,
            source: 'company_website',
          });
        });
        if (leads.length > 0) break;
        await sleep(500);
      } catch { continue; }
    }
    await sleep(800);
  }
  return leads;
}

// ── Source 3: LinkedIn public search via Bing ──
async function scrapeLinkedInViaSearch(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const titles = icp.job_titles || ['CTO'];
  const geo = icp.geo || '';
  const industries = icp.industries || [];

  for (const title of titles.slice(0, 2)) {
    if (leads.length >= count) break;
    const query = [
      `site:linkedin.com/in "${title}"`,
      industries.length ? `"${industries[0]}"` : '',
      geo,
    ].filter(Boolean).join(' ');

    const urls = await webSearch(query);
    const linkedinUrls = urls.filter(u => u.includes('linkedin.com/in/'));

    for (const url of linkedinUrls.slice(0, Math.ceil(count / titles.length) + 3)) {
      if (leads.length >= count) break;
      try {
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html',
          },
          timeout: 8000,
          maxRedirects: 3,
        });
        const $ = cheerio.load(res.data);
        const metaTitle = $('meta[property="og:title"]').attr('content') || '';
        const name = metaTitle.split(' - ')[0].trim() ||
          $('title').text().split(' - ')[0].trim() ||
          $('h1').first().text().trim();
        const headline = $('meta[property="og:description"]').attr('content') || '';

        if (!name || name.length < 2) continue;
        const parts = name.split(' ');
        leads.push({
          full_name: name,
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || undefined,
          job_title: headline.split(' at ')[0]?.trim() || title,
          company_name: headline.split(' at ')[1]?.trim() || undefined,
          linkedin_url: url,
          location: geo || undefined,
          source: 'linkedin',
        });
        await sleep(600 + Math.random() * 400);
      } catch { continue; }
    }
    await sleep(1000);
  }
  return leads;
}

// ── Main entry point ──
export async function scrapeLeads(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const titles = icp.job_titles || [];

  // Strategy 1: GitHub (for tech roles)
  if (isTechTitle(titles) || leads.length < count) {
    try {
      const ghLeads = await scrapeGitHub(icp, Math.ceil(count * 0.5));
      leads.push(...ghLeads);
      console.log(`[Scraper] GitHub: ${ghLeads.length} leads`);
    } catch (e) { console.warn('[Scraper] GitHub failed:', e); }
  }

  // Strategy 2: LinkedIn via Bing
  if (leads.length < count) {
    try {
      const liLeads = await scrapeLinkedInViaSearch(icp, Math.ceil((count - leads.length) * 0.6));
      leads.push(...liLeads);
      console.log(`[Scraper] LinkedIn/Bing: ${liLeads.length} leads`);
    } catch (e) { console.warn('[Scraper] LinkedIn/Bing failed:', e); }
  }

  // Strategy 3: Company website team pages
  if (leads.length < count) {
    try {
      const cwLeads = await scrapeCompanyLeads(icp, count - leads.length);
      leads.push(...cwLeads);
      console.log(`[Scraper] Company websites: ${cwLeads.length} leads`);
    } catch (e) { console.warn('[Scraper] Company websites failed:', e); }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = leads.filter(l => {
    const key = `${(l.full_name || l.email || '').toLowerCase()}-${(l.company_name || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, count);
}
