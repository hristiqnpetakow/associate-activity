'use client';

import Link from 'next/link';
import { History, RotateCcw, Trophy } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { loadGame, loadPlayers } from '@/lib/repo';
import { useLanguage } from '@/lib/i18n';
import type { GameRow, Player } from '@/lib/types';

export default function ResultsPage() {
  const { t } = useLanguage();
  const { gameId } = useParams<{ gameId: string }>();
  const [game,setGame]=useState<GameRow|null>(null); const [players,setPlayers]=useState<Player[]>([]); const [error,setError]=useState('');
  const router=useRouter();
  useEffect(()=>{let ok=true;(async()=>{try{const g=await loadGame(gameId);const p=await loadPlayers(g.room_id);if(ok){setGame(g);setPlayers(p);}}catch(e){if(ok)setError(e instanceof Error?e.message:t('genericError'))}})();return()=>{ok=false}},[gameId]);
  if(!game) return <AppShell><div className="mx-auto max-w-xl px-4 py-20 text-center font-bold">{error||t('loadResults')}</div></AppShell>;
  const teams=[...game.state.teams].sort((a,b)=>b.score-a.score); const winner=teams[0];
  return <AppShell><section className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12"><div className="text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-100 text-amber-600 shadow-sm"><Trophy size={36}/></div><div className="mt-6 text-sm font-bold text-gray-500">{t('gameFinished')}</div><h1 className="mt-2 text-5xl font-black tracking-tight">🏆 {winner?.name ?? t('winner')}</h1><p className="mt-3 text-gray-600">{t('congratulations')}</p></div>
    <div className="mt-10 grid gap-4 sm:grid-cols-3">{teams.slice(0,3).map((team,i)=><div key={team.id} className={`rounded-[2rem] bg-gradient-to-br ${team.color} p-6 text-white shadow-xl ${i===0?'sm:-translate-y-3':''}`}><div className="text-4xl">{['🥇','🥈','🥉'][i]}</div><div className="mt-4 text-2xl font-black">{team.name}</div><div className="mt-1 text-sm opacity-85">{team.playerIds.map(id=>players.find(p=>p.id===id)?.name).filter(Boolean).join(' · ')}</div><div className="mt-7 text-5xl font-black">{team.score}</div><div className="text-sm font-bold opacity-85">{t('overallPoints')}</div></div>)}</div>
    <div className="glass mt-8 rounded-[2rem] p-5 sm:p-7"><h2 className="text-xl font-black">{t('statistics')}</h2><div className="mt-4 space-y-3">{teams.map(team=><div key={team.id} className="rounded-2xl bg-black/[.035] p-4"><div className="flex items-center justify-between"><span className="font-black">{team.name}</span><span className="text-lg font-black">{team.score}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl bg-white/70 p-2"><div className="font-black">{team.roundScores['1']??0}</div><div className="text-gray-500">{t('round')} 1</div></div><div className="rounded-xl bg-white/70 p-2"><div className="font-black">{team.roundScores['2']??0}</div><div className="text-gray-500">{t('round')} 2</div></div><div className="rounded-xl bg-white/70 p-2"><div className="font-black">{team.roundScores['3']??0}</div><div className="text-gray-500">{t('round')} 3</div></div></div></div>)}</div></div>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"><button onClick={()=>router.push('/')} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-6 py-4 font-black text-white"><RotateCcw size={17}/> {t('newGameCta')}</button><Link href="/history" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-6 py-4 font-black"><History size={17}/> {t('historyCta')}</Link></div>
  </section></AppShell>;
}
