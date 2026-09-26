'use client';

import Link from 'next/link';
import { ArrowRight, Gamepad2, History, QrCode, Sparkles, Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';

export default function HomePage() {
  return <AppShell>
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm font-semibold shadow-sm backdrop-blur">
            <Sparkles size={15} /> Party game за 6–20+ души
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[.96] tracking-tight sm:text-7xl">
            Познай думата.<br />Разсмей всички.<br /><span className="bg-gradient-to-r from-indigo-600 via-fuchsia-500 to-rose-500 bg-clip-text text-transparent">Спечели играта.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">Създай стая, прати линк или QR код и играйте заедно в реално време — без регистрации и без презареждане.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/create" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-6 py-4 font-bold text-white shadow-xl transition hover:-translate-y-0.5">Нова игра <ArrowRight size={18} /></Link>
            <Link href="/join" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-6 py-4 font-bold backdrop-blur transition hover:-translate-y-0.5">Присъедини се <Users size={18} /></Link>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-indigo-400/20 via-fuchsia-400/10 to-rose-400/20 blur-3xl" />
          <div className="glass rounded-[2.25rem] p-5 sm:p-7">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-bold text-gray-500">Рунд 2 · Отбор Сини</div>
              <div className="rounded-full bg-rose-50 px-3 py-1 text-sm font-black text-rose-600">0:47</div>
            </div>
            <div className="rounded-[2rem] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-orange-400 p-8 text-center text-white shadow-xl">
              <div className="text-xs font-bold uppercase tracking-[.25em] opacity-80">Една дума</div>
              <div className="mt-4 text-5xl font-black">ПАНДА</div>
              <div className="mt-7 grid grid-cols-2 gap-3"><button className="rounded-2xl bg-white/15 px-4 py-3 font-bold backdrop-blur">⏭ Пас</button><button className="rounded-2xl bg-white px-4 py-3 font-black text-indigo-700">✅ Позната</button></div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm font-semibold">
              <div className="rounded-2xl bg-black/[.04] p-3"><div className="text-2xl font-black">18</div><div className="text-gray-500">точки</div></div>
              <div className="rounded-2xl bg-black/[.04] p-3"><div className="text-2xl font-black">2</div><div className="text-gray-500">пасa</div></div>
              <div className="rounded-2xl bg-black/[.04] p-3"><div className="text-2xl font-black">#1</div><div className="text-gray-500">място</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-16 grid gap-4 md:grid-cols-3">
        {[
          [Gamepad2, '3 рунда', 'Обяснение → една дума → пантомима'],
          [QrCode, 'Влез за секунди', 'Код, линк или QR — без регистрация'],
          [History, 'Запазена игра', 'Резултати, повторение със същите думи и история'],
        ].map(([Icon, title, text]) => <div key={title as string} className="glass rounded-3xl p-5"><Icon size={22} /><div className="mt-4 font-black">{title as string}</div><div className="mt-1 text-sm leading-6 text-gray-600">{text as string}</div></div>)}
      </div>
    </section>
  </AppShell>;
}
