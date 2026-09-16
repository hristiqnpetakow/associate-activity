import type { Metadata } from 'next';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Асоциации • Activity',
  description: 'Realtime multiplayer party game на български.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="bg"><body><RegisterSW />{children}</body></html>;
}
