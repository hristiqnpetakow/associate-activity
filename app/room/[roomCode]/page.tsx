'use client';

import Link from 'next/link';
import { Check, Crown, LogOut, Play, Users, Wifi } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { QRCodeBox } from '@/components/QRCodeBox';
import { WordInputForm } from '@/components/WordInputForm';
import { createGame, getRoomByCode, loadPlayers, setReady, submitWords as submitWordsFn } from '@/lib/repo';
import { ensureAnonymousSession } from '@/lib/auth';
import { buildGameState } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import type { Player, Room } from '@/lib/types';

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const code = String(params.roomCode ?? '').toUpperCase();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const me = useMemo(() => players.find(p => p.user_id === userId), [players, userId]);
  const allReady = players.length >= 4 && players.every(p => p.ready && p.words);

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        const session = await ensureAnonymousSession();
        if (!session?.user?.id) throw new Error('Няма активна сесия.');
        const foundRoom = await getRoomByCode(code);
        if (!foundRoom) throw new Error('Тази стая не съществува.');
        const foundPlayers = await loadPlayers(foundRoom.id);
        if (!foundPlayers.some(p => p.user_id === session.user.id)) {
          router.replace(`/join/${foundRoom.code}`);
          return;
        }
        if (!alive) return;
        setUserId(session.user.id); setRoom(foundRoom); setPlayers(foundPlayers); setLoading(false);
        if (foundRoom.game_id) router.replace(`/game/${foundRoom.game_id}`);
      } catch (err) { if (alive) { setError(err instanceof Error ? err.message : 'Възникна грешка.'); setLoading(false); } }
    }
    init();
    return () => { alive = false; };
  }, [code, router]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase.channel(`room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, async () => setPlayers(await loadPlayers(room.id)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        const next = payload.new as Room;
        setRoom(next);
        if (next.game_id) router.replace(`/game/${next.game_id}`);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room, router]);

  async function submitWords(words: Parameters<typeof submitWordsFn>[1]) { await submitWordsFn(room!.id, words); }
  async function startGame() {
    if (!room || !allReady || !me?.is_host) return;
    setStarting(true); setError('');
    try { const state = buildGameState(room, players); const game = await createGame(room, state); router.replace(`/game/${game.id}`); }
    catch (err) { setError(err instanceof Error ? err.message : 'Не успяхме да започнем играта.'); setStarting(false); }
  }

  if (loading) return <AppShell><div className="mx-auto max-w-5xl px-4 py-20 text-center font-bold">Зареждане на стаята…</div></AppShell>;
  if (error && !room) return <AppShell><div className="mx-auto max-w-xl px-4 py-20"><div className="glass rounded-3xl p-6"><div className="font-black text-rose-600">{error}</div><Link href="/" className="mt-4 inline-block font-bold underline">Начало</Link></div></div></AppShell>;
  if (!room || !me) return null;

  const readyCount = players.filter(p => p.ready).length;
  return <AppShell><section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-sm font-bold text-gray-500">Стая · {room.code}</div><h1 className="mt-1 text-4xl font-black tracking-tight">Чакаме всички 🎉</h1><p className="mt-2 text-gray-600">Всеки играч въвежда своите 12 думи.</p></div><div className="rounded-2xl bg-white/70 px-4 py-3 text-center shadow-sm"><div className="text-2xl font-black">{players.length}</div><div className="text-xs font-bold text-gray-500">играчи</div></div></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
      <div className="space-y-4"><QRCodeBox code={room.code}/><div className="glass rounded-3xl p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black"><Wifi size={18}/> Онлайн</div><div className="text-sm font-bold text-gray-500">{readyCount}/{players.length} готови</div></div><div className="mt-4 space-y-2">{players.map(p=><div key={p.id} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white/50 px-4 py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-black text-xs font-black text-white">{p.name.slice(0,2).toUpperCase()}</div><span className="font-bold">{p.name}{p.user_id===userId && ' (ти)'}</span>{p.is_host&&<Crown size={15} className="text-amber-500"/>}</div>{p.ready?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-600"><Check size={13}/> Готов</span>:<span className="text-xs font-semibold text-gray-400">Въвежда…</span>}</div>)}</div></div></div>
      <div className="glass rounded-3xl p-5 sm:p-7"><div className="mb-5 flex items-center gap-2 font-black"><Users size={19}/> Твоите 12 думи</div>{me.ready ? <div className="rounded-3xl bg-emerald-50 p-6 text-center"><div className="text-4xl">✅</div><div className="mt-3 text-xl font-black">Готов си!</div><p className="mt-1 text-sm text-emerald-700">Изчакай останалите играчи.</p><button onClick={()=>setReady(room.id,false)} className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-bold shadow-sm">Редактирай думите</button></div> : <WordInputForm onSubmit={submitWords}/>}
      </div>
    </div>
    {error && <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-600">{error}</div>}
    <div className="mt-6 glass rounded-3xl p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-black">Отбори по {room.team_size}</div><div className="mt-1 text-sm text-gray-500">Минимум 4 играчи. Отборите се разбъркват автоматично.</div></div>{me.is_host ? <button onClick={startGame} disabled={!allReady||starting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-6 py-4 font-black text-white shadow-xl disabled:cursor-not-allowed disabled:opacity-40"><Play size={18}/>{starting?'Стартиране…':'Започни играта'}</button> : <div className="inline-flex items-center gap-2 text-sm font-bold text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-amber-400 pulse-soft"/> Изчакване на домакина…</div>}</div></div>
    <div className="mt-4 text-center"><button className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-rose-600"><LogOut size={15}/> Изход</button></div>
  </section></AppShell>;
}

