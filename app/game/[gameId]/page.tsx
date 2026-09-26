'use client';

import { Check, ChevronRight, Crown, Flame, Pause, Play, RotateCcw, Sparkles, Timer, Trophy, Volume2, VolumeX, WandSparkles } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ensureAnonymousSession } from '@/lib/auth';
import { roleForTeam } from '@/lib/game';
import { loadGame, loadPlayers, loadRoom, saveGameState } from '@/lib/repo';
import { beginNextTurn } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import type { Card, GameRow, GameState, Player } from '@/lib/types';
import { formatTime } from '@/lib/utils';

function names(players: Player[], ids: string[]) {
  return ids.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean).join(' • ');
}

function roundTitle(round: 1 | 2 | 3) {
  if (round === 1) return 'ОБЯСНЕНИЕ';
  if (round === 2) return 'ЕДНА ДУМА';
  return 'ПАНТОМИМА';
}

function roundEmoji(round: 1 | 2 | 3) {
  if (round === 1) return '🗣️';
  if (round === 2) return '💡';
  return '🎭';
}

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
        setUserId(session.user.id);
        setGame(g);
        setRoom(r);
        setPlayers(p);
        if (g.state.gameStatus === 'FINISHED') router.replace(`/results/${g.id}`);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Не успяхме да заредим играта.');
      }
    }
    init();
    return () => { active = false; };
  }, [gameId, router]);

  useEffect(() => {
    if (!game) return;
    const channel = supabase
      .channel(`game-${game.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, (payload) => {
        const next = payload.new as GameRow;
        setGame(next);
        if (next.state.gameStatus === 'FINISHED') router.replace(`/results/${next.id}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [game?.id, router]);

  const state = game?.state as GameState | undefined;
  const team = state?.teams.find((t) => t.id === state.teamOrder[state.currentTeamIndex]) ?? null;
  const currentRole = team ? roleForTeam(team, team.turnNumber) : null;
  const isExplainer = Boolean(currentRole?.explainerId && players.find((p) => p.id === currentRole.explainerId)?.user_id === userId);
  const meName = players.find((p) => p.user_id === userId)?.name ?? '';

  useEffect(() => {
    if (!state?.endAt || state.gameStatus !== 'PLAYING') {
      setSeconds(state?.pausedRemainingMs ? Math.ceil(state.pausedRemainingMs / 1000) : 0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.ceil((new Date(state.endAt!).getTime() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
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
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 680;
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch { /* audio is optional */ }
  }

  async function persist(next: GameState) {
    if (!game) return;
    const saved = await saveGameState(game, next);
    setGame(saved);
  }

  async function timeoutTurn() {
    if (!state || !game || state.gameStatus !== 'PLAYING' || !team || (state.endAt && Date.now() < new Date(state.endAt).getTime())) return;
    setBusy(true);
    beep();
    try {
      const nextIndex = (state.currentTeamIndex + 1) % state.teamOrder.length;
      const nextState: GameState = { ...state, currentTeamIndex: nextIndex };
      const continued = beginNextTurn(nextState, state.bonusTimeSeconds);
      await persist(continued);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешно преминаване към следващия ход.');
    } finally {
      setBusy(false);
    }
  }

  function nextCardAfterCorrect(nextDeck: Card[], nextPassed: Card[]) {
    if (nextDeck.length) {
      const deckCopy = [...nextDeck];
      return { deck: deckCopy.slice(0, -1), passedDeck: nextPassed, card: deckCopy.at(-1) ?? null, source: 'deck' as const };
    }
    if (nextPassed.length) {
      const passedCopy = [...nextPassed];
      return { deck: nextDeck, passedDeck: passedCopy, card: passedCopy.at(-1) ?? null, source: 'passed' as const };
    }
    return { deck: nextDeck, passedDeck: nextPassed, card: null, source: null };
  }

  async function correct() {
    if (!state || !game || !team || !state.currentCard || busy || !isExplainer) return;
    if (state.endAt && Date.now() >= new Date(state.endAt).getTime()) {
      await timeoutTurn();
      return;
    }

    setBusy(true);
    setError('');
    try {
      const roundKey = String(state.round);
      const teams = state.teams.map((t) =>
        t.id === team.id
          ? { ...t, score: t.score + 1, roundScores: { ...t.roundScores, [roundKey]: (t.roundScores[roundKey] ?? 0) + 1 } }
          : t,
      );
      const cardId = state.currentCard.id;
      const wasPassedCard = state.currentCardSource === 'passed';
      const nextDeck = state.deck.filter((c) => c.id !== cardId);
      const nextPassed = wasPassedCard
        ? state.passedDeck.filter((c) => c.id !== cardId)
        : state.passedDeck;
      const picked = nextCardAfterCorrect(nextDeck, nextPassed);

      // ПАСОВЕТЕ представляват свободните места в списъка с до 3 пасувани карти.
      // Ако познаем пасувана дума, освобождаваме едно място и получаваме +1 пас.
      const nextPassesRemaining = wasPassedCard
        ? Math.min(3, state.passesRemaining + 1)
        : state.passesRemaining;

      const nextBase: GameState = {
        ...state,
        teams,
        deck: picked.deck,
        passedDeck: picked.passedDeck,
        currentCard: picked.card,
        currentCardSource: picked.source,
        passesRemaining: nextPassesRemaining,
        lastEvent: wasPassedCard
          ? `${team.name} позна пасувана дума! +1 точка • +1 пас`
          : `${team.name} позна! +1`,
      };

      if (!picked.card) {
        const bonus = state.endAt ? Math.max(0, Math.ceil((new Date(state.endAt).getTime() - Date.now()) / 1000)) : 0;
        if (state.round < 3) {
          const nextRound = (state.round + 1) as 1 | 2 | 3;
          const newDeck = [...state.allCards].sort(() => Math.random() - 0.5);
          const first = newDeck.pop() ?? null;
          const now = Date.now();
          const duration = 60 + bonus;
          const next: GameState = {
            ...nextBase,
            round: nextRound,
            currentTeamIndex: 0,
            deck: newDeck,
            passedDeck: [],
            currentCard: first,
            currentCardSource: first ? 'deck' : null,
            passesRemaining: 3,
            bonusTimeSeconds: bonus,
            turnStartedAt: new Date(now).toISOString(),
            endAt: new Date(now + duration * 1000).toISOString(),
            pausedRemainingMs: null,
            roundStartedAt: new Date(now).toISOString(),
            lastEvent: `🎉 Рунд ${state.round} приключи! Следва Рунд ${nextRound}`,
          };
          await persist(next);
        } else {
          const winner = [...teams].sort((a, b) => b.score - a.score)[0];
          await persist({ ...nextBase, gameStatus: 'FINISHED', endAt: null, winnerTeamId: winner?.id ?? null, lastEvent: '🏆 Играта приключи!' });
        }
      } else {
        await persist(nextBase);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешно отбелязване.');
    } finally {
      setBusy(false);
    }
  }

  async function pass() {
    if (!state || !game || !team || !state.currentCard || busy || !isExplainer) return;

    // Ако сме се върнали към вече пасувана дума, можем да продължим към
    // нова дума, без да харчим нов пас, но само ако имаме свободен пас-слот.
    // При 3 активни пасувани думи основното тесте е блокирано, докато не
    // познаем поне една от пасуваните карти.
    if (state.currentCardSource === 'passed') {
      if (state.passesRemaining <= 0 || state.deck.length === 0) return;

      setBusy(true);
      setError('');
      try {
        const nextDeck = [...state.deck];
        const nextCard = nextDeck.pop() ?? null;
        await persist({
          ...state,
          deck: nextDeck,
          // Текущата дума остава в passedDeck.
          passedDeck: state.passedDeck,
          currentCard: nextCard,
          currentCardSource: nextCard ? 'deck' : 'passed',
          // НЕ намаляваме passesRemaining.
          passesRemaining: state.passesRemaining,
          lastEvent: `${team.name} остави пасуваната дума и изтегли нова`,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Неуспешно теглене на нова дума.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Нормален ПАС на нова дума — тук се използва един от 3-те паса.
    if (state.passesRemaining <= 0) return;

    setBusy(true);
    setError('');
    try {
      const nextPassed = [state.currentCard, ...state.passedDeck].slice(0, 3);
      const remainingPasses = state.passesRemaining - 1;
      const nextDeck = [...state.deck];
      const nextCard = nextDeck.pop() ?? null;

      // Ако има нова дума, продължаваме напред.
      // Ако няма, показваме една от пасуваните думи.
      const fallbackPassed = nextPassed[0] ?? null;
      await persist({
        ...state,
        deck: nextDeck,
        passedDeck: nextPassed,
        currentCard: nextCard ?? fallbackPassed,
        currentCardSource: nextCard ? 'deck' : (fallbackPassed ? 'passed' : null),
        passesRemaining: remainingPasses,
        lastEvent: `${team.name} пасува`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешен пас.');
    } finally {
      setBusy(false);
    }
  }

  async function pickPassedCard(cardId: string) {
    if (!state || !game || busy || !isExplainer) return;
    const card = state.passedDeck.find((item) => item.id === cardId);
    if (!card) return;
    setBusy(true);
    try {
      await persist({
        ...state,
        currentCard: card,
        currentCardSource: 'passed',
        lastEvent: `Върната е пасувана дума: ${card.text}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не успяхме да изберем пасуваната дума.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    if (!state || !room || userId !== room.host_user_id || busy) return;
    setBusy(true);
    try {
      if (state.gameStatus === 'PAUSED') {
        const remaining = state.pausedRemainingMs ?? 0;
        const now = Date.now();
        await persist({ ...state, gameStatus: 'PLAYING', endAt: new Date(now + remaining).toISOString(), pausedRemainingMs: null, lastEvent: 'Играта продължи' });
      } else if (state.gameStatus === 'PLAYING' && state.endAt) {
        const remaining = Math.max(0, new Date(state.endAt).getTime() - Date.now());
        await persist({ ...state, gameStatus: 'PAUSED', pausedRemainingMs: remaining, endAt: null, lastEvent: 'Играта е на пауза' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неуспешна пауза.');
    } finally {
      setBusy(false);
    }
  }

  if (!game || !state || !team || !room) {
    return <AppShell><div className="mx-auto max-w-xl px-4 py-20 text-center"><div className="glass rounded-[2rem] p-7">{error ? <div className="font-bold text-rose-600">{error}</div> : <div className="font-bold">Зареждаме играта…</div>}</div></div></AppShell>;
  }

  const timerDanger = seconds <= 10;
  const ranking = [...state.teams].sort((a, b) => b.score - a.score);
  const explainer = players.find((p) => p.id === currentRole?.explainerId);
  const guesser = players.find((p) => p.id === currentRole?.guesserId);
  const passedWords = state.passedDeck;
  const canChoosePassed = true;
  const canDrawNewFromPassed = state.currentCardSource === 'passed' && state.passesRemaining > 0 && state.deck.length > 0;
  const nextTeam = state.teams.find((t) => t.id === state.teamOrder[(state.currentTeamIndex + 1) % state.teamOrder.length]);

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-3 pb-10 pt-2 sm:px-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-[.12em] text-slate-500">
              <span className="game-chip">{roundEmoji(state.round)} Рунд {state.round}</span>
              <span className={`game-chip bg-gradient-to-r ${team.color} text-white border-0`}>{team.name}</span>
            </div>
            <h1 className="game-title text-4xl font-black tracking-tight sm:text-6xl">{roundTitle(state.round)}</h1>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button onClick={() => persist({ ...state, soundOn: !state.soundOn })} className="icon-button" aria-label="Звук">
              {state.soundOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            {room.host_user_id === userId && <button onClick={togglePause} className="icon-button" aria-label="Пауза">
              {state.gameStatus === 'PAUSED' ? <Play size={19} /> : <Pause size={19} />}
            </button>}
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="game-stat"><Timer size={17} /><span>Време</span><strong className={timerDanger ? 'text-rose-500' : ''}>{formatTime(seconds)}</strong></div>
          <div className="game-stat"><Flame size={17} /><span>Свободни пасове</span><strong>{state.passesRemaining}/3</strong></div>
          <div className="game-stat"><Trophy size={17} /><span>Ваш резултат</span><strong>{team.score}</strong></div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className={`game-showcase ${timerDanger && state.gameStatus === 'PLAYING' ? 'timer-danger' : ''}`}>
              <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-3xl" />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="showcase-kicker">СЕГА ИГРАЕ</div>
                  <div className="mt-1 flex items-center gap-2 text-lg font-black">{team.name} <ChevronRight size={18} className="opacity-60" /> {nextTeam?.name ?? '—'}</div>
                </div>
                <div className={`timer-orb ${timerDanger ? 'danger' : ''}`}><span>{formatTime(seconds)}</span></div>
              </div>

              <div className="relative z-10 mt-6 rounded-[2rem] bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur-sm sm:p-3">
                <div className="rounded-[1.6rem] bg-white px-5 py-8 text-center text-slate-950 shadow-[0_30px_80px_rgba(11,8,40,.28)] sm:px-10 sm:py-12">
                  <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black uppercase tracking-[.2em] text-violet-700">
                    <WandSparkles size={14} /> {state.currentCardSource === 'passed' ? 'ПАСУВАНА ДУМА' : state.round === 3 ? 'ПОКАЖИ С ЯЗИКА НА ТЯЛОТО' : 'ПОЗНАЙ ДУМАТА'}
                  </div>
                  <div className="mt-7 min-h-28 grid place-items-center sm:min-h-36">
                    <div className="word-display break-words">{state.currentCard?.text ?? 'Няма карта'}</div>
                  </div>
                  <div className="mt-6 text-sm font-bold leading-6 text-slate-500 sm:text-base">
                    {state.round === 1 ? 'Обяснявай свободно, но без самата дума и нейни производни.' : state.round === 2 ? 'Само една подсказваща дума. Без изречения.' : 'Без думи и звуци — само жестове, мимики и пантомима.'}
                  </div>
                  {state.currentCardSource === 'passed' && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800">↩️ Връщаме се към пасувана дума</div>}
                </div>
              </div>

              <div className="relative z-10 mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={pass}
                  disabled={!isExplainer || busy || (state.currentCardSource === 'passed' ? !canDrawNewFromPassed : state.passesRemaining <= 0) || state.gameStatus !== 'PLAYING'}
                  className="game-action secondary disabled:opacity-35"
                >
                  <span className="text-2xl">⏭️</span>
                  <span>{state.currentCardSource === 'passed' ? 'НОВА ДУМА' : 'ПАС'}</span>
                  <small>
                    {state.currentCardSource === 'passed'
                      ? (canDrawNewFromPassed ? 'не харчи пас' : 'първо познай пасувана')
                      : `${state.passesRemaining} оставащи`}
                  </small>
                </button>
                <button onClick={correct} disabled={!isExplainer || busy || state.gameStatus !== 'PLAYING'} className="game-action primary disabled:opacity-35">
                  <span className="text-2xl">✅</span><span>ПОЗНАТА!</span><small>{state.currentCardSource === 'passed' ? '→ тегли нова' : '+1 точка'}</small>
                </button>
              </div>

              {!isExplainer && <div className="relative z-10 mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-black text-white ring-1 ring-white/10">🎯 Ти си познаващият — гледай думата и помагай с реакциите!</div>}
              {state.gameStatus === 'PAUSED' && <div className="relative z-10 mt-4 rounded-2xl bg-amber-300 px-4 py-3 text-center font-black text-amber-950">⏸ Играта е на пауза</div>}
            </div>

            {passedWords.length > 0 && (
              <div className={`glass rounded-[2rem] p-4 sm:p-5 ${canChoosePassed ? 'ring-2 ring-amber-400/60' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-black text-lg"><RotateCcw size={18} /> Пасувани думи <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{passedWords.length}/3</span></div>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Избери пасувана карта по всяко време. Ако имаш свободен пас-слот, можеш да я оставиш в паса и да изтеглиш нова. При 3 пасувани карти трябва да познаеш пасувана дума; тогава освобождаваш 1 слот и получаваш обратно 1 пас.</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">+1 пас при позната пасувана дума</span>
                </div>
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {passedWords.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => pickPassedCard(card.id)}
                      disabled={busy}
                      className={`passed-card ${state.currentCard?.id === card.id ? 'active' : ''} ${canChoosePassed ? 'clickable' : ''}`}
                    >
                      <span>{card.text}</span>
                      {state.currentCard?.id === card.id && <span className="absolute right-2 top-2 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-black text-white">СЕГА</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-600">{error}</div>}

            <div className="glass rounded-[2rem] p-4 sm:p-5">
              <div className="flex flex-wrap gap-2 text-sm font-bold">
                <span className="status-pill"><Sparkles size={14} /> {state.deck.length + state.passedDeck.length + (state.currentCard ? 1 : 0)} карти в играта</span>
                <span className="status-pill">👤 {meName}</span>
                <span className="status-pill">➡️ Следва {nextTeam?.name ?? '—'}</span>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="glass rounded-[2rem] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black text-lg"><Crown size={18} className="text-amber-500" /> Класиране</div><div className="text-xs font-black uppercase tracking-wider text-slate-400">Общо</div></div>
              <div className="space-y-2">
                {ranking.map((t, i) => (
                  <div key={t.id} className={`rounded-2xl border border-white/15 bg-gradient-to-r ${t.color} p-3 text-white shadow-lg ${t.id === team.id ? 'scale-[1.02] ring-2 ring-white/70' : ''}`}>
                    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-black"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white/20 text-xs">{i + 1}</span>{t.name}</div><div className="text-2xl font-black tabular-nums">{t.score}</div></div>
                    <div className="mt-2 text-xs font-bold opacity-85">{names(players, t.playerIds)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass rounded-[2rem] p-5">
              <div className="flex items-center justify-between"><div className="font-black">Рунд {state.round}</div><div className="text-xs font-black text-slate-400">ТОЧКИ</div></div>
              <div className="mt-3 space-y-2">
                {state.teams.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl bg-black/[.035] px-3 py-2.5 dark:bg-white/[.05]"><span className="font-bold">{t.name}</span><span className="font-black tabular-nums">{t.roundScores[String(state.round)] ?? 0}</span></div>)}
              </div>
            </div>

            <div className="rounded-[2rem] bg-gradient-to-br from-amber-300 via-orange-300 to-pink-300 p-[1px] shadow-xl">
              <div className="rounded-[1.95rem] bg-white/80 p-5 backdrop-blur dark:bg-slate-950/70">
                <div className="flex items-center gap-2 font-black"><Flame size={18} className="text-orange-500" /> Правило на рунда</div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{state.round === 1 ? 'Много думи, никакъв корен.' : state.round === 2 ? 'Само една дума за подсказка.' : 'Действай — без звук.'}</p>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-5 text-center text-xs font-bold text-slate-400">{explainer?.name ?? '—'} обяснява <span className="mx-1">•</span> {guesser?.name ?? '—'} познава <span className="mx-1">•</span> realtime ⚡</div>
      </section>
    </AppShell>
  );
}
