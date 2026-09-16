'use client';

import Link from 'next/link';
import { Moon, Sun, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

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
    <main className="min-h-screen grid-bg">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-black text-white shadow-lg"><Sparkles size={19} /></span>
          <span>Асоциации</span>
        </Link>
        <button onClick={toggle} aria-label="Смени тема" className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white/70 backdrop-blur transition hover:scale-105">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      {children}
    </main>
  );
}
