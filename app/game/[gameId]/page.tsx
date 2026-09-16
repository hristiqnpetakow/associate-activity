'use client';

import { Check, ChevronLeft, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ensureAnonymousSession } from '@/lib/auth';
import { roleForTeam } from '@/lib/game';
import { loadGame, loadPlayers, loadRoom, saveGameState } from '@/lib/repo';
import { beginNextTurn } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import type { GameRow, GameState, Player } from '@/lib/types';
import { formatTime } from '@/lib/utils';

function names(players: Player[], ids: string[]) { return ids.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(', '); }

export default function GamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = String(params.gameId);
  const router = useRouter();
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [room, setRoom] = useState<Awaited<ReturnType<typeof loadRoom>> | null>(null);
  const [userId, setUserId] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const session = await ensureAnonymousSession();
        if (!session?.user?.id) throw new Error('Няма активна сесия.');
        const g = await loadGame(gameId);
        const [r, p] = await Promise.all([loadRoom(g.room_id), loadPlayers(g.room_id)]);
        if (!active) return;
        setUserId(session.user.id); setGame(g); setRoom(r); setPlayers(p);
        if (g.state.gameStatus === 'FINISHED') router.replace(`/results/${g.id}`);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Не успяхме да заредим играта.'); }
    }
    init();
    return () => { active = false; };
  }, [gameId, router]);

  useEffect(() => {
    if (!game) return;
    const channel = supabase.channel(`game-${game.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, (payload) => {
        const next = payload.new as GameRow;
        setGame(next);
        if (next.state.gameStatus === 'FINISHED') router.replace(`/results/${next.id}`);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [game?.id, router]);

  const state = game?.state as GameState | undefined;
  const team = state?.teams.find(t => t.id === state.teamOrder[state.currentTeamIndex]) ?? null;
  const currentRole = team ? roleForTeam(team, team.turnNumber) : null;
  const isExplainer = Boolean(currentRole?.explainerId && players.find(p => p.id === currentRole.explainerId)?.user_id === userId);
  const meName = players.find(p => p.user_id === userId)?.name ?? '';

  useEffect(() => {
    if (!state?.endAt || state.gameStatus !== 'PLAYING') { setSeconds(state?.pausedRemainingMs ? Math.ceil(state.pausedRemainingMs/1000) : 0); return; }
    const tick = () => setSeconds(Math.max(0, Math.ceil((new Date(state.endAt!).getTime() - Date.now()) / 1000)));
    tick(); const interval = setInterval(tick, 250); return () => clearInterval(interval);
  }, [state?.endAt, state?.gameStatus, state?.pausedRemainingMs]);

  useEffect(() => {
    if (state?.gameStatus === 'PLAYING' && seconds === 0 && state.endAt && !busy) {
      void timeoutTurn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  function beep() {
    if (!state?.soundOn) return;
    try {
      const ctx = audioRef.current ?? new AudioContext(); audioRef.current = ctx;
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 680; gain.gain.value = 0.08; osc.start(); osc.stop(ctx.currentTime + 0.16);
    } catch { /* audio is optional */ }
  }

  async function persist(next: GameState) {
    if (!game) return;
    const saved = await saveGameState(game, next);
    setGame(saved);
  }

  async function timeoutTurn() {
    if (!state || !game || state.gameStatus !== 'PLAYING' || !team || state.endAt && Date.now() < new Date(state.endAt).getTime()) return;
    setBusy(true); beep();
    try {
      const nextIndex = (state.currentTeamIndex + 1) % state.teamOrder.length;
      const nextState: GameState = { ...state, currentTeamIndex: nextIndex };
      const continued = beginNextTurn(nextState, state.round === 1 || state.round === 2 || state.round === 3 ? state.bonusTimeSeconds : 0);
      await persist(continued);
    } catch (err) { setError(err instanceof Error ? err.message : 'Неуспешно преминаване към следващия ход.'); }
    finally { setBusy(false); }
  }

  async function correct() {
    if (!state || !game || !team || !state.currentCard || busy || !isExplainer) return;
    if (state.endAt && Date.now() >= new Date(state.endAt).getTime()) { await timeoutTurn(); return; }
    setBusy(true); setError('');
    try {
      const roundKey = String(state.round);
      const teams = state.teams.map(t => t.id === team.id ? { ...t, score: t.score + 1, roundScores: { ...t.roundScores, [roundKey]: (t.roundScores[roundKey] ?? 0) + 1 } } : t);
      const cardId = state.currentCard.id;
      const deck = state.deck.filter(c => c.id !== cardId);
      const passedDeck = state.passedDeck.filter(c => c.id !== cardId);
      const pool = deck.length ? deck : passedDeck;
      const currentCard = pool.length ? pool[pool.length - 1] : null;
      const nextBase: GameState = { ...state, teams, deck, passedDeck, currentCard, lastEvent: `${team.name} позна! +1` };
      if (!currentCard) {
        const bonus = state.endAt ? Math.max(0, Math.ceil((new Date(state.endAt).getTime() - Date.now()) / 1000)) : 0;
        if (state.round < 3) {
          const nextRound = (state.round + 1) as 1 | 2 | 3;
          const rotatedTeams = teams.map(t => t.id === teams[0]?.id ? { ...t, turnNumber: t.turnNumber + 1 } : t);
          const newDeck = [...state.allCards].sort(() => Math.random() - .5);
          const first = newDeck.pop() ?? null;
          const now = Date.now();
          const duration = 60 + bonus;
          const resetTeams = rotatedTeams.map(t => ({ ...t, roundScores: { ...t.roundScores } }));
          const next: GameState = { ...nextBase, round: nextRound, teams: resetTeams, currentTeamIndex: 0, deck: newDeck, passedDeck: [], currentCard: first, passesRemaining: 3, bonusTimeSeconds: bonus, turnStartedAt: new Date(now).toISOString(), endAt: new Date(now + duration*1000).toISOString(), pausedRemainingMs: null, roundStartedAt: new Date(now).toISOString(), lastEvent: `Рунд ${state.round} приключи! Следва Рунд ${nextRound}` };
          await persist(next);
        } else {
          const winner = [...teams].sort((a,b)=>b.score-a.score)[0];
          await persist({ ...nextBase, gameStatus: 'FINISHED', endAt: null, winnerTeamId: winner?.id ?? null, lastEvent: 'Играта приключи!' });
        }
      } else {
        await persist(nextBase);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Неуспешно отбелязване.'); }
    finally { setBusy(false); }
  }

  async function pass() {
    if (!state || !game || !team || !state.currentCard || busy || !isExplainer || state.passesRemaining <= 0) return;
    setBusy(true); setError('');
    try {
      const id = state.currentCard.id;
      const deck = state.deck.filter(c => c.id !== id);
      const passedDeck = [state.currentCard, ...state.passedDeck];
      const source = deck.length ? deck : passedDeck;
      const currentCard = source[source.length - 1] ?? null;
      const next: GameState = { ...state, deck, passedDeck, currentCard, passesRemaining: state.passesRemaining - 1, lastEvent: `${team.name} пасува` };
      await persist(next);
    } catch (err) { setError(err instanceof Error ? err.message : 'Неуспешен пас.'); }
    finally { setBusy(false); }
  }

  async function togglePause() {
    if (!state || !room || userId !== room.host_user_id || busy) return;
    setBusy(true);
    try {
      if (state.gameStatus === 'PAUSED') {
        const remaining = state.pausedRemainingMs ?? 0; const now = Date.now();
        await persist({ ...state, gameStatus: 'PLAYING', endAt: new Date(now + remaining).toISOString(), pausedRemainingMs: null, lastEvent: 'Играта продължи' });
      } else if (state.gameStatus === 'PLAYING' && state.endAt) {
        const remaining = Math.max(0, new Date(state.endAt).getTime() - Date.now());
        await persist({ ...state, gameStatus: 'PAUSED', pausedRemainingMs: remaining, endAt: null, lastEvent: 'Играта е на пауза' });
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Неуспешна пауза.'); }
    finally { setBusy(false); }
  }

  if (!game || !state || !team || !room) return <AppShell><div className="mx-auto max-w-xl px-4 py-20 text-center"><div className="glass rounded-3xl p-7">{error ? <div className="font-bold text-rose-600">{error}</div> : <div className="font-bold">Зареждаме играта…</div>}</div></div></AppShell>;

  const timerDanger = seconds <= 10;
  const ranking = [...state.teams].sort((a,b)=>b.score-a.score);
  const explainer = players.find(p => p.id === currentRole?.explainerId);
  const guesser = players.find(p => p.id === currentRole?.guesserId);

  return <AppShell><section className="mx-auto max-w-6xl px-3 pb-10 pt-2 sm:px-6">
    <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-gray-500">Рунд {state.round} · {team.name}</div><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-4xl">{state.round===1?'Обяснение':state.round===2?'Една дума':'Пантомима'}</h1></div><div className="flex items-center gap-2"><button onClick={()=>persist({...state,soundOn:!state.soundOn})} className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white/70" aria-label="Звук">{state.soundOn?<Volume2 size={18}/>:<VolumeX size={18}/>}</button>{room.host_user_id===userId&&<button onClick={togglePause} className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white/70" aria-label="Пауза">{state.gameStatus==='PAUSED'?<Play size={18}/>:<Pause size={18}/>}</button>}</div></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className={`glass rounded-[2rem] p-5 sm:p-7 ${timerDanger && state.gameStatus==='PLAYING'?'ring-4 ring-rose-500/15':''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-gray-500">Обяснява</div><div className="mt-1 font-black">{explainer?.name ?? '—'} <span className="text-gray-400">→</span> {guesser?.name ?? '—'}</div></div><div className={`rounded-2xl px-4 py-2 text-2xl font-black tabular-nums ${timerDanger?'bg-rose-50 text-rose-600':'bg-black text-white'}`}>{formatTime(seconds)}</div></div>
          <div className="mt-5 rounded-[2rem] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-6 text-center text-white shadow-2xl sm:p-10"><div className="text-xs font-black uppercase tracking-[.32em] opacity-75">{state.round===3?'ЖЕСТОВЕ':'ТВОЯТА ДУМА'}</div><div className="mt-5 min-h-28 grid place-items-center"><div className="text-4xl font-black sm:text-6xl break-words">{state.currentCard?.text ?? 'Няма карта'}</div></div><div className="mt-6 text-sm font-semibold opacity-85">{state.round===1?'Обясни без да използваш самата дума или нейни производни.':state.round===2?'Само една дума като подсказа. Без изречения.':'Без думи, звуци или писане — само пантомима.'}</div></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><button onClick={pass} disabled={!isExplainer||busy||state.passesRemaining<=0||state.gameStatus!=='PLAYING'} className="rounded-2xl border border-black/10 bg-white/70 px-5 py-5 text-lg font-black disabled:opacity-30">⏭ Пас <span className="ml-1 text-sm font-bold text-gray-500">({state.passesRemaining})</span></button><button onClick={correct} disabled={!isExplainer||busy||state.gameStatus!=='PLAYING'} className="rounded-2xl bg-black px-5 py-5 text-lg font-black text-white shadow-xl disabled:opacity-30">✅ Позната</button></div>
          {!isExplainer && <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-700">Ти не си обясняващият играч. Следи екрана и познавай! 🎯</div>}
          {state.gameStatus==='PAUSED' && <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-center font-black text-amber-700">⏸ Играта е на пауза</div>}
        </div>
        {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-600">{error}</div>}
        <div className="glass rounded-3xl p-5"><div className="flex flex-wrap gap-2 text-sm font-bold"><span className="rounded-full bg-black/5 px-3 py-1.5">{state.deck.length + state.passedDeck.length + (state.currentCard?1:0)} карти в рунда</span><span className="rounded-full bg-black/5 px-3 py-1.5">Ти: {meName}</span><span className="rounded-full bg-black/5 px-3 py-1.5">Следва: {state.teamOrder[(state.currentTeamIndex+1)%state.teamOrder.length] ? state.teams.find(t=>t.id===state.teamOrder[(state.currentTeamIndex+1)%state.teamOrder.length])?.name : '—'}</span></div></div>
      </div>
      <aside className="space-y-4"><div className="glass rounded-3xl p-5"><div className="mb-4 flex items-center justify-between"><div className="font-black">Класиране</div><div className="text-xs font-bold text-gray-500">Общо</div></div><div className="space-y-2">{ranking.map((t,i)=><div key={t.id} className={`rounded-2xl border border-black/5 bg-gradient-to-r ${t.color} p-3 text-white`}><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/20 text-xs">{i+1}</span>{t.name}</div><div className="text-2xl font-black">{t.score}</div></div><div className="mt-2 text-xs font-semibold opacity-85">{names(players,t.playerIds)}</div></div>)}</div></div><div className="glass rounded-3xl p-5"><div className="font-black">Точки по рундове</div><div className="mt-3 space-y-2">{state.teams.map(t=><div key={t.id} className="flex items-center justify-between rounded-2xl bg-black/[.035] px-3 py-2 text-sm"><span className="font-bold">{t.name}</span><span className="font-black">{t.roundScores[String(state.round)] ?? 0}</span></div>)}</div></div></aside>
    </div>
    <div className="mt-4 text-center text-xs font-semibold text-gray-500">Играч: {meName} · Синхронизирано в реално време</div>
  </section></AppShell>;
}
