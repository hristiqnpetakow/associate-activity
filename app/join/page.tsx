'use client';

import { ArrowRight, Gamepad2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { getRoomByCode, joinRoom } from '@/lib/repo';
import { isValidPlayerName } from '@/lib/utils';

export default function JoinPage({ initialCode = '' }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) { setError('Въведи 6-символен код на стаята.'); return; }
    if (!isValidPlayerName(name)) { setError('Името трябва да е между 2 и 24 символа.'); return; }
    setLoading(true); setError('');
    try { const room = await getRoomByCode(normalized); if (!room) throw new Error('Не намерихме стая с този код.'); await joinRoom(room.id, name); router.push(`/room/${room.code}`); }
    catch (err) { setError(err instanceof Error ? err.message : 'Възникна грешка.'); setLoading(false); }
  }
  return <AppShell><section className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
    <Link href="/" className="text-sm font-semibold text-gray-600">← Начало</Link>
    <div className="mt-7 glass rounded-[2rem] p-6 sm:p-8">
      <div className="inline-flex rounded-2xl bg-rose-50 p-3 text-rose-600"><Gamepad2 size={22} /></div><h1 className="mt-4 text-4xl font-black tracking-tight">Присъедини се</h1><p className="mt-2 text-gray-600">Въведи кода от приятеля, който е създал играта.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block"><span className="mb-2 block text-sm font-bold">Код на стаята</span><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" placeholder="AB7K2X" className="w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-4 text-center text-2xl font-black tracking-[.3em] outline-none focus:ring-4 focus:ring-indigo-500/10" /></label>
        <label className="block"><span className="mb-2 block text-sm font-bold">Твоето име</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder="Напр. Мария" className="w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-4 outline-none focus:ring-4 focus:ring-indigo-500/10" /></label>
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</div>}
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 font-black text-white shadow-xl disabled:opacity-50">{loading ? 'Влизаме…' : 'Влез в играта'} <ArrowRight size={18}/></button>
      </form>
    </div>
  </section></AppShell>;
}
