# LeadGen AI — Setup Guide

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your keys:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | See Step 4 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | dashboard.stripe.com → Developers → API keys |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for dev |
| `SERPAPI_KEY` | serpapi.com (optional, improves scraping) |

## 3. Run the app

```bash
npm run dev
```

Open http://localhost:3000

## 4. Set up Stripe webhook (local dev)

Install Stripe CLI: https://stripe.com/docs/stripe-cli

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the webhook secret printed and put it in `STRIPE_WEBHOOK_SECRET`.

## 5. Run the pipeline worker (optional)

In a separate terminal:

```bash
npm run worker
```

Or the Next.js API route handles pipeline triggering automatically after payment.

## Architecture

```
User → /  (ICP form)
     → POST /api/jobs  (creates job, returns Stripe checkout URL)
     → Stripe Checkout
     → Stripe Webhook → /api/stripe/webhook  (marks job paid)
     → /api/pipeline/run  (triggers pipeline async)
     → Pipeline: scrape → LLM enrich → score → save leads
     → /dashboard  (poll job status)
     → GET /api/jobs/{id}/leads  (download CSV)
```

## Pricing Model

- $5 base fee per job + $1 per lead
- 25 leads = $30, 100 leads = $105, 200 leads = $205

## Production Deployment

1. Deploy to Vercel or Railway
2. Set all env vars
3. Configure Stripe webhook endpoint: `https://yourdomain.com/api/stripe/webhook`
4. Run worker as separate process or use a job queue (Bull, Inngest)
5. Move SQLite to Postgres for multi-instance deployments
