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
  company_size?: string;      // e.g. "11-50", "51-200", "201-500", "501-1000", "1001-5000"
  industries?: string[];      // e.g. ["SaaS", "FinTech"]
  job_titles?: string[];      // e.g. ["VP Sales", "Head of Marketing"]
  geo?: string;               // e.g. "United States", "Germany"
  lead_count?: number;
}

// Google search via SerpAPI (if key available) or direct HTML scraping
async function googleSearch(query: string, num = 10): Promise<string[]> {
  const serpApiKey = process.env.SERPAPI_KEY;

  if (serpApiKey) {
    try {
      const res = await axios.get('https://serpapi.com/search', {
        params: { q: query, num, api_key: serpApiKey, engine: 'google' },
        timeout: 10000,
      });
      return (res.data.organic_results || []).map((r: { link: string }) => r.link);
    } catch {
      // fall through to direct scrape
    }
  }

  // Fallback: scrape Google directly (best-effort, may be blocked)
  try {
    const res = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(res.data);
    const links: string[] = [];
    $('a[href^="http"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href && !href.includes('google.com') && !href.includes('googleapis')) {
        links.push(href);
      }
    });
    return links.slice(0, num);
  } catch {
    return [];
  }
}

// Extract LinkedIn profile data from public profile page
async function scrapeLinkedInProfile(url: string): Promise<Partial<RawLead> | null> {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html',
      },
      timeout: 8000,
    });
    const $ = cheerio.load(res.data);

    // LinkedIn public profiles expose structured data
    const name = $('h1.top-card-layout__title').text().trim() ||
                 $('h1[class*="name"]').first().text().trim() ||
                 $('meta[property="og:title"]').attr('content')?.split(' - ')[0] || '';

    const title = $('h2.top-card-layout__headline').text().trim() ||
                  $('div.top-card-layout__entity-info h2').text().trim() || '';

    const company = $('span.top-card-layout__company').text().trim() ||
                    $('a[data-tracking-control-name="public_profile_topcard_current_company"]').text().trim() || '';

    const location = $('span.top-card__subline-item').first().text().trim() || '';

    if (!name) return null;
    const parts = name.split(' ');
    return {
      full_name: name,
      first_name: parts[0],
      last_name: parts.slice(1).join(' '),
      job_title: title,
      company_name: company,
      location,
      linkedin_url: url,
      source: 'linkedin',
    };
  } catch {
    return null;
  }
}

// Scrape company website for contact/team page leads
async function scrapeCompanyWebsite(website: string, jobTitles: string[]): Promise<RawLead[]> {
  const leads: RawLead[] = [];

  const teamPages = ['/team', '/about', '/about-us', '/our-team', '/people', '/leadership'];

  for (const page of teamPages.slice(0, 3)) {
    try {
      const url = website.replace(/\/$/, '') + page;
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGenBot/1.0)' },
        timeout: 6000,
      });
      const $ = cheerio.load(res.data);
      const domain = new URL(website).hostname;

      // Extract person cards
      $('[class*="team"], [class*="member"], [class*="person"], [class*="staff"]').each((_, el) => {
        const name = $(el).find('h2, h3, h4, [class*="name"]').first().text().trim();
        const title = $(el).find('p, [class*="title"], [class*="role"], [class*="position"]').first().text().trim();

        if (!name || name.length < 3) return;

        // Check if title matches any target job title
        const matchesICP = jobTitles.length === 0 || jobTitles.some(t =>
          title.toLowerCase().includes(t.toLowerCase())
        );
        if (!matchesICP) return;

        const parts = name.split(' ');
        leads.push({
          full_name: name,
          first_name: parts[0],
          last_name: parts.slice(1).join(' '),
          job_title: title,
          company_name: domain,
          company_website: website,
          source: 'company_website',
        });
      });

      if (leads.length > 0) break;
    } catch {
      continue;
    }
  }
  return leads;
}

// Find LinkedIn profiles via Google search
async function findLinkedInProfiles(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const titles = icp.job_titles || ['CTO', 'VP Engineering', 'Head of Product'];
  const geo = icp.geo || '';
  const industries = icp.industries || [];

  for (const title of titles.slice(0, 3)) {
    const query = [
      `site:linkedin.com/in`,
      `"${title}"`,
      industries.length > 0 ? industries[0] : '',
      geo ? geo : '',
    ].filter(Boolean).join(' ');

    const urls = await googleSearch(query, Math.ceil(count / titles.length) + 5);
    const linkedinUrls = urls.filter(u => u.includes('linkedin.com/in/'));

    for (const url of linkedinUrls.slice(0, Math.ceil(count / titles.length))) {
      const profile = await scrapeLinkedInProfile(url);
      if (profile) {
        leads.push({ source: 'linkedin', ...profile } as RawLead);
        // Rate limit
        await sleep(800 + Math.random() * 500);
      }
    }
  }
  return leads;
}

// Find companies matching ICP, then scrape their team pages
async function findCompanyLeads(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  const industries = icp.industries || [];
  const size = icp.company_size || '';
  const titles = icp.job_titles || ['CEO', 'CTO', 'VP Sales'];
  const geo = icp.geo || '';

  const query = [
    industries.join(' OR '),
    size ? `company size ${size} employees` : '',
    geo,
    'company',
  ].filter(Boolean).join(' ');

  const urls = await googleSearch(query, 20);
  const companyUrls = urls.filter(u =>
    !u.includes('linkedin.com') &&
    !u.includes('google.com') &&
    !u.includes('wikipedia.org') &&
    !u.includes('glassdoor.com')
  );

  for (const url of companyUrls.slice(0, 5)) {
    try {
      const baseUrl = new URL(url).origin;
      const companyLeads = await scrapeCompanyWebsite(baseUrl, titles);
      leads.push(...companyLeads);
      if (leads.length >= count) break;
      await sleep(1000);
    } catch {
      continue;
    }
  }
  return leads;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scrapeLeads(icp: ICP, count: number): Promise<RawLead[]> {
  const leads: RawLead[] = [];

  // Strategy 1: LinkedIn profiles via Google
  try {
    const linkedinLeads = await findLinkedInProfiles(icp, Math.ceil(count * 0.6));
    leads.push(...linkedinLeads);
  } catch (e) {
    console.warn('LinkedIn scraping failed:', e);
  }

  // Strategy 2: Company website team pages
  if (leads.length < count) {
    try {
      const companyLeads = await findCompanyLeads(icp, count - leads.length);
      leads.push(...companyLeads);
    } catch (e) {
      console.warn('Company scraping failed:', e);
    }
  }

  // Deduplicate by name+company
  const seen = new Set<string>();
  const unique = leads.filter(l => {
    const key = `${l.full_name || ''}-${l.company_name || ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, count);
}
