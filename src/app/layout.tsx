import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeadGen AI — B2B Lead Generation',
  description: 'Generate enriched, scored B2B leads from your ICP definition. Pay per lead.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
