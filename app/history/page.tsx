'use client';

import Link from 'next/link';
import { ArrowLeft, Clock3, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { getSessionUserId } from '@/lib/repo';
import { supabase } from '@/lib/supabase';
import type { GameRow, Room } from '@/lib/types';

export default function HistoryPage(){
  const [items,setItems]=useState<{game:GameRow;room:Room}[]>([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;(async()=>{try{const uid=await getSessionUserId();const {data:players}=await supabase.from('players').select('room_id').eq('user_id',uid);const roomIds=[...new Set((players??[]).map(p=>p.room_id))];if(!roomIds.length){if(active)setItems([]);return;}const [{data:rooms},{data:games}]=await Promise.all([supabase.from('rooms').select('*').in('id',roomIds),supabase.from('games').select('*').in('room_id',roomIds).eq('state->>gameStatus','FINISHED').order('created_at',{ascending:false})]);const roomMap=new Map((rooms??[]).map(r=>[r.id,r as Room]));if(active)setItems((games??[]).map(g=>({game:g as GameRow,room:roomMap.get(g.room_id)!})).filter(x=>x.room));}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);
  return <AppShell><section className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12"><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600"><ArrowLeft size={16}/> Начало</Link><h1 className="mt-7 text-4xl font-black tracking-tight">История</h1><p className="mt-2 text-gray-600">Приключените игри от този браузър.</p>{loading?<div className="mt-8 glass rounded-3xl p-7 text-center font-bold">Зареждане…</div>:items.length===0?<div className="mt-8 glass rounded-3xl p-10 text-center"><Trophy className="mx-auto text-gray-300" size={40}/><div className="mt-4 font-black">Още няма приключени игри.</div><Link href="/create" className="mt-5 inline-block rounded-2xl bg-black px-5 py-3 font-bold text-white">Създай игра</Link></div>:<div className="mt-8 space-y-3">{items.map(({game,room})=><Link key={game.id} href={`/results/${game.id}`} className="glass flex items-center justify-between gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5"><div><div className="font-black">Стая {room.code}</div><div className="mt-1 flex items-center gap-2 text-sm text-gray-500"><Clock3 size={14}/>{new Date(game.finished_at??game.updated_at).toLocaleString('bg-BG')}</div></div><div className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">🏆 {game.state.teams.find(t=>t.id===game.state.winnerTeamId)?.name??'—'} · {Math.max(...game.state.teams.map(t=>t.score))}</div></Link>)}</div>}</section></AppShell>;
}
