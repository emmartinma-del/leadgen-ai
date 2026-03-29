'use client';

import { useState } from 'react';
import Link from 'next/link';

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'];
const INDUSTRIES_LIST = ['SaaS', 'FinTech', 'HealthTech', 'E-commerce', 'EdTech', 'Manufacturing', 'Logistics', 'Real Estate', 'Marketing', 'HR Tech', 'Security', 'DevTools'];

function TagInput({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInput('');
    }
  };
  return (
    <div className="tag-input" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 44 }}>
      {value.map(tag => (
        <span key={tag} className="tag">
          {tag}
          <button onClick={() => onChange(value.filter(t => t !== tag))} type="button">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        placeholder={value.length === 0 ? placeholder : 'Add more...'}
        style={{ border: 'none', background: 'transparent' }}
      />
    </div>
  );
}

export default function Home() {
  const [email, setEmail] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [geo, setGeo] = useState('');
  const [leadCount, setLeadCount] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pricePerLead = 1.00;
  const baseFee = 5.00;
  const total = baseFee + leadCount * pricePerLead;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Email is required'); return; }
    if (jobTitles.length === 0) { setError('Add at least one target job title'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, company_size: companySize, industries, job_titles: jobTitles, geo, lead_count: leadCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }
      window.location.href = data.checkoutUrl;
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="container">
        <nav className="nav">
          <div className="logo">Lead<span>Gen</span> AI</div>
          <Link href="/dashboard" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: 14 }}>
            My Jobs
          </Link>
        </nav>

        <div style={{ background: 'linear-gradient(135deg, #6c63ff22, #22c55e22)', border: '1px solid #6c63ff44', borderRadius: 8, padding: '10px 20px', textAlign: 'center', marginBottom: 24, fontSize: 14 }}>
          <strong style={{ color: '#22c55e' }}>Pilot Offer:</strong> First 3 customers get <strong>$30 credit</strong> (25 leads free). <span style={{ color: 'var(--muted)' }}>2 spots left.</span>
        </div>

        <div className="hero">
          <h1>B2B Leads from Your<br />ICP Definition</h1>
          <p>Describe your ideal customer. We scrape, enrich with AI, and score leads. Pay only per lead — no subscription required.</p>
        </div>

        <div className="features">
          <div className="feature">
            <div className="feature-icon">🎯</div>
            <h3>ICP-Targeted</h3>
            <p>Define company size, industry, job titles, and geo. We find the exact people you want.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">🤖</div>
            <h3>AI-Enriched</h3>
            <p>Every lead gets pain signals, recent activity, and a quality score from Claude AI.</p>
          </div>
          <div className="feature">
            <div className="feature-icon">💳</div>
            <h3>Pay Per Lead</h3>
            <p>$5 base + $1/lead. No subscription. Download CSV when your job completes.</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 4 }}>Sample Output</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>This is what your enriched leads look like. Every lead includes contact info, pain signals, and an AI quality score.</p>
          {[
            {
              name: 'Sarah Chen', title: 'VP of Sales', company: 'Nexlayer (Series A, 45 employees)',
              email: 's.chen@nexlayer.io', score: 91,
              pain: 'Team tripled in 6 months; manually building prospect lists in Sheets. No dedicated SDR tooling. Recent LinkedIn post asking for outbound stack recs.',
            },
            {
              name: 'Marcus Webb', title: 'Head of Revenue Ops', company: 'Stackform (SaaS, 120 employees)',
              email: 'm.webb@stackform.com', score: 84,
              pain: 'Migrating from HubSpot to Salesforce — gap in lead enrichment during transition. Hiring 3 BDRs this quarter per job board.',
            },
            {
              name: 'Priya Nair', title: 'Founder / CEO', company: 'Claritix (Pre-seed, 8 employees)',
              email: 'priya@claritix.co', score: 78,
              pain: 'Doing all outbound herself. No sales hire yet. Public GitHub shows active product; no CRM in tech stack. Open to tools that save time.',
            },
          ].map((lead, i) => (
            <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: i < 2 ? 10 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{lead.name}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}> · {lead.title} · {lead.company}</span>
                </div>
                <span style={{ background: lead.score >= 90 ? '#1a3a2a' : lead.score >= 80 ? '#1a2a3a' : '#2a2a1a', color: lead.score >= 90 ? 'var(--success)' : lead.score >= 80 ? '#60a5fa' : 'var(--warning)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {lead.score} / 100
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>{lead.email}</div>
              <div style={{ fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>Pain signals: </span>{lead.pain}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Generate Leads</h2>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Your Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>

            <div className="row">
              <div className="field">
                <label>Target Job Titles * <span style={{ color: 'var(--muted)', textTransform: 'none' }}>(press Enter to add)</span></label>
                <TagInput value={jobTitles} onChange={setJobTitles} placeholder="VP Sales, CTO, Head of Marketing..." />
              </div>
              <div className="field">
                <label>Industries <span style={{ color: 'var(--muted)', textTransform: 'none' }}>(press Enter to add)</span></label>
                <TagInput value={industries} onChange={setIndustries} placeholder="SaaS, FinTech..." />
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {INDUSTRIES_LIST.filter(i => !industries.includes(i)).slice(0, 6).map(i => (
                    <button key={i} type="button" onClick={() => setIndustries([...industries, i])}
                      style={{ fontSize: 11, padding: '2px 8px', background: 'var(--border)', border: 'none', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer' }}>
                      + {i}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>Company Size</label>
                <select value={companySize} onChange={e => setCompanySize(e.target.value)}>
                  <option value="">Any size</option>
                  {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </div>
              <div className="field">
                <label>Geography</label>
                <input type="text" value={geo} onChange={e => setGeo(e.target.value)} placeholder="United States, Germany, UK..." />
              </div>
            </div>

            <div className="field">
              <label>Number of Leads: <strong style={{ color: 'var(--text)' }}>{leadCount}</strong></label>
              <input type="range" min={5} max={200} step={5} value={leadCount}
                onChange={e => setLeadCount(Number(e.target.value))}
                style={{ background: 'transparent', border: 'none', padding: '8px 0', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                <span>5</span><span>200</span>
              </div>
            </div>

            <div className="price-preview">
              <div>
                <div className="label">Total Price</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>$5 base + ${pricePerLead}/lead × {leadCount}</div>
              </div>
              <div className="amount">${total.toFixed(2)}</div>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? <><span className="spinner"></span> Creating job...</> : `Pay $${total.toFixed(2)} & Generate ${leadCount} Leads`}
            </button>
          </form>
        </div>

        <footer className="footer">
          <p>LeadGen AI · Pay per lead · No subscription required · <Link href="/dashboard">My Jobs</Link></p>
        </footer>
      </div>
    </div>
  );
}
