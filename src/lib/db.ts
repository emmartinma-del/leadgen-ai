// Uses Node.js built-in node:sqlite (available in Node.js 22+, no native compilation needed)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite');
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || './data/leadgen.db';
const resolvedPath = path.resolve(process.cwd(), DB_PATH);

// Ensure data directory exists
const dataDir = path.dirname(resolvedPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;
let db: DB;

export function getDb(): DB {
  if (!db) {
    db = new DatabaseSync(resolvedPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      stripe_customer_id TEXT,
      plan TEXT DEFAULT 'pay_per_lead',
      credits INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      icp_company_size TEXT,
      icp_industries TEXT,
      icp_job_titles TEXT,
      icp_geo TEXT,
      lead_count_requested INTEGER DEFAULT 25,
      leads_found INTEGER DEFAULT 0,
      error TEXT,
      stripe_payment_intent_id TEXT,
      stripe_session_id TEXT,
      paid INTEGER DEFAULT 0,
      amount_cents INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      full_name TEXT,
      email TEXT,
      linkedin_url TEXT,
      job_title TEXT,
      company_name TEXT,
      company_website TEXT,
      company_size TEXT,
      industry TEXT,
      location TEXT,
      pain_signals TEXT,
      recent_activity TEXT,
      score INTEGER DEFAULT 0,
      score_reason TEXT,
      source TEXT,
      enriched INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_leads_job_id ON leads(job_id);
  `);
}

export type User = {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  plan: string;
  credits: number;
  created_at: number;
};

export type Job = {
  id: string;
  user_id: string;
  status: 'pending' | 'paid' | 'running' | 'done' | 'failed';
  icp_company_size: string | null;
  icp_industries: string | null;
  icp_job_titles: string | null;
  icp_geo: string | null;
  lead_count_requested: number;
  leads_found: number;
  error: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  paid: number;
  amount_cents: number;
  created_at: number;
  updated_at: number;
};

export type Lead = {
  id: string;
  job_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  job_title: string | null;
  company_name: string | null;
  company_website: string | null;
  company_size: string | null;
  industry: string | null;
  location: string | null;
  pain_signals: string | null;
  recent_activity: string | null;
  score: number;
  score_reason: string | null;
  source: string | null;
  enriched: number;
  created_at: number;
};
