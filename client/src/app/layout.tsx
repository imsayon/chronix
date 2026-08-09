import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
});

export const metadata: Metadata = {
  title: 'Chronix',
  description: 'Distributed cron scheduling platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
