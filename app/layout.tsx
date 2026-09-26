import type { Metadata } from 'next';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';
import { LanguageProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Associations • Activity',
  description: 'Realtime multiplayer party game.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="bg"><body><LanguageProvider><RegisterSW />{children}</LanguageProvider></body></html>;
}
