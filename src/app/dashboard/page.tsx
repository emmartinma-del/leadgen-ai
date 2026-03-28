'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

type Job = {
  id: string;
  status: 'pending' | 'paid' | 'running' | 'done' | 'failed';
  icp_company_size: string | null;
  icp_industries: string | null;
  icp_job_titles: string | null;
  icp_geo: string | null;
  lead_count_requested: number;
  leads_found: number;
  error: string | null;
  paid: number;
  amount_cents: number;
  created_at: number;
  updated_at: number;
};

function StatusBadge({ status }: { status: Job['status'] }) {
  const labels: Record<Job['status'], string> = {
    pending: 'Pending Payment',
    paid: 'Queued',
    running: 'Processing',
    done: 'Complete',
    failed: 'Failed',
  };
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parseTags(json: string | null): string {
  if (!json) return '—';
  try { return JSON.parse(json).join(', '); } catch { return json; }
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const success = searchParams.get('success');
  const jobParam = searchParams.get('job');

  const fetchJobs = useCallback(async (emailToFetch: string) => {
    if (!emailToFetch) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs?email=${encodeURIComponent(emailToFetch)}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-poll running jobs
  useEffect(() => {
    if (!fetched || !email) return;
    const hasRunning = jobs.some(j => j.status === 'running' || j.status === 'paid');
    if (!hasRunning) return;
    const interval = setInterval(() => fetchJobs(email), 8000);
    return () => clearInterval(interval);
  }, [jobs, fetched, email, fetchJobs]);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJobs(email);
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="container">
        <nav className="nav">
          <Link href="/" className="logo">Lead<span>Gen</span> AI</Link>
          <Link href="/" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: 14 }}>
            + New Job
          </Link>
        </nav>

        <h1 style={{ marginBottom: 8, fontSize: '1.8rem', fontWeight: 800 }}>My Jobs</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Enter your email to view your lead generation jobs.</p>

        {success && (
          <div className="alert alert-success">
            Payment confirmed! Your lead generation job is queued. Processing starts shortly — refresh in a few minutes.
          </div>
        )}

        <div className="card" style={{ marginBottom: 24 }}>
          <form onSubmit={handleLookup} style={{ display: 'flex', gap: 12 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
              {loading ? <span className="spinner"></span> : 'Load Jobs'}
            </button>
          </form>
        </div>

        {fetched && (
          <div className="jobs-list">
            {jobs.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: 48 }}>
                No jobs found for this email. <Link href="/">Create your first job →</Link>
              </div>
            )}
            {jobs.map(job => (
              <div key={job.id} className="job-card">
                <div className="job-card-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StatusBadge status={job.status} />
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>#{job.id.slice(0, 8)}</span>
                    </div>
                    <div className="job-card-meta" style={{ marginTop: 6 }}>
                      <strong>Titles:</strong> {parseTags(job.icp_job_titles)} &nbsp;
                      {job.icp_industries && <><strong>Industries:</strong> {parseTags(job.icp_industries)} &nbsp;</>}
                      {job.icp_geo && <><strong>Geo:</strong> {job.icp_geo} &nbsp;</>}
                      {job.icp_company_size && <><strong>Size:</strong> {job.icp_company_size}</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {job.status === 'done' ? `${job.leads_found} leads` : `${job.lead_count_requested} requested`}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>${(job.amount_cents / 100).toFixed(2)} paid</div>
                  </div>
                </div>

                {(job.status === 'running') && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '60%' }}></div>
                  </div>
                )}

                {job.error && (
                  <div className="alert alert-error" style={{ marginBottom: 0, marginTop: 10 }}>
                    Error: {job.error}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(job.created_at)}</span>
                  <div className="job-card-actions" style={{ margin: 0 }}>
                    {job.status === 'pending' && (
                      <span style={{ fontSize: 13, color: 'var(--warning)' }}>Awaiting payment</span>
                    )}
                    {job.status === 'done' && job.paid && (
                      <a
                        href={`/api/jobs/${job.id}/leads`}
                        className="btn btn-primary"
                        style={{ padding: '7px 16px', fontSize: 13 }}
                      >
                        Download CSV
                      </a>
                    )}
                    {(job.status === 'running' || job.status === 'paid') && (
                      <button
                        onClick={() => fetchJobs(email)}
                        className="btn"
                        style={{ padding: '7px 16px', fontSize: 13, background: 'var(--border)', color: 'var(--text)' }}
                      >
                        Refresh
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="footer">
          <p>LeadGen AI · Pay per lead · <Link href="/">Generate more leads</Link></p>
        </footer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
