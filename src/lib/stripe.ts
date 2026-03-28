import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

const PRICE_PER_LEAD_CENTS = parseInt(process.env.PRICE_PER_LEAD || '100'); // $1.00 default
const BASE_FEE_CENTS = 500; // $5 base fee per job

export function calculateJobPrice(leadCount: number): number {
  return BASE_FEE_CENTS + leadCount * PRICE_PER_LEAD_CENTS;
}

export async function createCheckoutSession({
  jobId,
  leadCount,
  userEmail,
  appUrl,
}: {
  jobId: string;
  leadCount: number;
  userEmail: string;
  appUrl: string;
}): Promise<string> {
  const amountCents = calculateJobPrice(leadCount);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `B2B Lead Generation — ${leadCount} Leads`,
            description: `Enriched, scored leads matching your ICP. Base fee $5 + $${PRICE_PER_LEAD_CENTS / 100}/lead.`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: { jobId, leadCount: String(leadCount) },
    success_url: `${appUrl}/dashboard?job=${jobId}&success=1`,
    cancel_url: `${appUrl}/?cancelled=1`,
  });

  return session.url!;
}

export async function createMonthlySubscription({
  userEmail,
  appUrl,
}: {
  userEmail: string;
  appUrl: string;
}): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'LeadGen Pro — Monthly',
            description: 'Unlimited lead gen jobs, up to 500 leads/month',
          },
          unit_amount: parseInt(process.env.MONTHLY_PRICE || '9900'),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard?subscribed=1`,
    cancel_url: `${appUrl}/pricing?cancelled=1`,
  });

  return session.url!;
}
