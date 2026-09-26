'use client';

import { ArrowLeft, Check, Shuffle, Users, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { createRoom } from '@/lib/repo';
import { isValidPlayerName } from '@/lib/utils';
import type { TeamAssignmentMode } from '@/lib/types';

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [teamSize, setTeamSize] = useState<2 | 3>(2);
  const [teamAssignmentMode, setTeamAssignmentMode] = useState<TeamAssignmentMode>('RANDOM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPlayerName(name)) { setError('Името трябва да е между 2 и 24 символа.'); return; }
    setLoading(true); setError('');
    try {
      const room = await createRoom(name, teamSize, teamAssignmentMode);
      router.push(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Възникна грешка.');
      setLoading(false);
    }
  }

  return <AppShell><section className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600"><ArrowLeft size={16} /> Начало</Link>
    <div className="mt-7 glass rounded-[2rem] p-6 sm:p-8">
      <div className="mb-8"><div className="inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-600"><Users size={22} /></div><h1 className="mt-4 text-4xl font-black tracking-tight">Нова игра</h1><p className="mt-2 text-gray-600">Настрой отборите и покани компанията.</p></div>
      <form onSubmit={submit} className="space-y-6">
        <label className="block"><span className="mb-2 block text-sm font-bold">Твоето име</span><input autoFocus value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder="Напр. Християн" className="w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-4 outline-none focus:ring-4 focus:ring-indigo-500/10" /></label>
        <div><div className="mb-2 text-sm font-bold">Отбори по</div><div className="grid grid-cols-2 gap-3">{([2,3] as const).map(size=><button key={size} type="button" onClick={()=>setTeamSize(size)} className={`rounded-2xl border p-4 text-left transition ${teamSize===size ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-500/10' : 'border-black/10 bg-white/60'}`}><div className="text-2xl font-black">{size}</div><div className="mt-1 text-sm text-gray-500">играчи</div>{teamSize===size && <Check className="mt-2 text-indigo-600" size={18}/>}</button>)}</div></div>
        <div>
          <div className="mb-2 text-sm font-bold">Разпределение на отборите</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={()=>setTeamAssignmentMode('RANDOM')} className={`rounded-2xl border p-4 text-left transition ${teamAssignmentMode==='RANDOM' ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-500/10' : 'border-black/10 bg-white/60'}`}>
              <div className="flex items-center gap-2 font-black"><Shuffle size={18}/> Случайно</div>
              <p className="mt-1 text-sm text-gray-500">Приложението разбърква всички играчи.</p>
            </button>
            <button type="button" onClick={()=>setTeamAssignmentMode('MANUAL')} className={`rounded-2xl border p-4 text-left transition ${teamAssignmentMode==='MANUAL' ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-500/10' : 'border-black/10 bg-white/60'}`}>
              <div className="flex items-center gap-2 font-black"><UserRound size={18}/> Избирате сами</div>
              <p className="mt-1 text-sm text-gray-500">Всеки играч избира към кой отбор да се присъедини.</p>
            </button>
          </div>
        </div>
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</div>}
        <button disabled={loading} className="w-full rounded-2xl bg-black px-5 py-4 font-black text-white shadow-xl disabled:opacity-50">{loading ? 'Създаваме стаята…' : 'Създай игра'}</button>
      </form>
    </div>
  </section></AppShell>;
}
