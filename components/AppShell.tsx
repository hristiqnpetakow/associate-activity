'use client';

import Link from 'next/link';
import { Moon, Sparkles, Sun } from 'lucide-react';
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
    <main className="party-page min-h-screen overflow-hidden">
      <div className="party-blob blob-one" />
      <div className="party-blob blob-two" />
      <div className="party-blob blob-three" />
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-3">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span className="text-lg font-black tracking-tight">Асоциации<span className="brand-dot">.</span></span>
        </Link>
        <button onClick={toggle} aria-label="Смени тема" className="icon-button">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <div className="relative z-10">{children}</div>
    </main>
  );
}
