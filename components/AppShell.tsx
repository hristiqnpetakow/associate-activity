'use client';

import Link from 'next/link';
import { Languages, Moon, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    const saved = localStorage.getItem('activity-dark') === '1';
    setDark(saved);
    document.documentElement.dataset.theme = saved ? 'dark' : 'light';
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem('activity-dark', next ? '1' : '0');
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
  }

  return (
    <main className="party-page min-h-screen overflow-hidden">
      <div className="party-blob blob-one" />
      <div className="party-blob blob-two" />
      <div className="party-blob blob-three" />
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span className="text-lg font-black tracking-tight">{t('brand')}<span className="brand-dot">.</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-2xl border border-black/10 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10" aria-label={t('language')}>
            <Languages size={15} className="mx-1 text-slate-500" />
            {(['bg', 'en'] as const).map((code) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-black transition ${language === code ? 'bg-black text-white dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'}`}
              >
                {code === 'bg' ? 'БГ' : 'EN'}
              </button>
            ))}
          </div>
          <button onClick={toggle} aria-label={t('theme')} className="icon-button">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <div className="relative z-10">{children}</div>
    </main>
  );
}
