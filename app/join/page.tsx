'use client';

import { ArrowRight, Gamepad2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { getRoomByCode, joinRoom } from '@/lib/repo';
import { useLanguage } from '@/lib/i18n';
import { isValidPlayerName } from '@/lib/utils';

export default function JoinPage({ initialCode = '' }: { initialCode?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) { setError(t('sixDigitCode')); return; }
    if (!isValidPlayerName(name)) { setError(t('invalidName')); return; }
    setLoading(true); setError('');
    try { const room = await getRoomByCode(normalized); if (!room) throw new Error(t('roomNotFound')); await joinRoom(room.id, name); router.push(`/room/${room.code}`); }
    catch (err) { setError(err instanceof Error ? err.message : t('genericError')); setLoading(false); }
  }
  return <AppShell><section className="mx-auto max-w-xl px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
    <Link href="/" className="text-sm font-semibold text-gray-600">← {t('backHome')}</Link>
    <div className="mt-7 glass rounded-[2rem] p-6 sm:p-8">
      <div className="inline-flex rounded-2xl bg-rose-50 p-3 text-rose-600"><Gamepad2 size={22} /></div><h1 className="mt-4 text-4xl font-black tracking-tight">{t('joinTitle')}</h1><p className="mt-2 text-gray-600">{t('joinSubtitle')}</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block"><span className="mb-2 block text-sm font-bold">{t('roomCode')}</span><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" placeholder={t('roomCodePlaceholder')} className="w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-4 text-center text-2xl font-black tracking-[.28em] outline-none focus:ring-4 focus:ring-rose-500/10" /></label>
        <label className="block"><span className="mb-2 block text-sm font-bold">{t('yourName')}</span><input autoFocus={!code} value={name} onChange={e=>setName(e.target.value)} maxLength={24} placeholder={t('namePlaceholder')} className="w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-4 outline-none focus:ring-4 focus:ring-rose-500/10" /></label>
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</div>}
        <button disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 font-black text-white shadow-xl disabled:opacity-50">{loading ? t('entering') : t('enterGame')} <ArrowRight size={18}/></button>
      </form>
    </div>
  </section></AppShell>;
}
