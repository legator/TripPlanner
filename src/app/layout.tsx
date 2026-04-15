import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trip Planner - Plan Your Road Trip',
  description:
    'Plan your road trip with smart daily driving plans, overnight stays, gas station stops, and attractions along the way.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
