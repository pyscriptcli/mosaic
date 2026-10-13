import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KOPI SAIGON | Competitor Landscape · Tiada Hari Tanpa Kopi',
  description: 'Explore KOPI SAIGON’s competitor landscape, pricing tiers, and coffee hotspots in Quezon City.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

