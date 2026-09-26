'use client';

import { Check, ChevronRight, Crown, Flame, Pause, Play, RotateCcw, Sparkles, Timer, Trophy, Volume2, VolumeX, WandSparkles } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useLanguage } from '@/lib/i18n';
import { ensureAnonymousSession } from '@/lib/auth';
import { roleForTeam } from '@/lib/game';
import { loadGame, loadPlayers, loadRoom, saveGameState } from '@/lib/repo';
import { beginNextRound, beginNextTurn } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import type { Card, GameRow, GameState, Player } from '@/lib/types';
import { formatTime } from '@/lib/utils';

function names(players: Player[], ids: string[]) {
  return ids.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean).join(' • ');
}

function roundEmoji(round: 1 | 2 | 3) {
  if (round === 1) return '🗣️';
  if (round === 2) return '💡';
  return '🎭';
}

export default function GamePage() {
  const { t, language } = useLanguage();
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
        if (!session?.user?.id) throw new Error(t('invalidGameSession'));
        const g = await loadGame(gameId);
        const [r, p] = await Promise.all([loadRoom(g.room_id), loadPlayers(g.room_id)]);
        if (!active) return;
        setUserId(session.user.id);
        setGame(g);
        setRoom(r);
        setPlayers(p);
        if (g.state.gameStatus === 'FINISHED') router.replace(`/results/${g.id}`);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : t('loadGameFailed'));
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

  const phase = state?.phase ?? 'TURN_ACTIVE';

  useEffect(() => {
    if (!state?.endAt || state.gameStatus !== 'PLAYING' || phase !== 'TURN_ACTIVE') {
      setSeconds(state?.pausedRemainingMs ? Math.ceil(state.pausedRemainingMs / 1000) : 0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.ceil((new Date(state.endAt!).getTime() - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [state?.endAt, state?.gameStatus, state?.pausedRemainingMs, phase]);

  useEffect(() => {
    if (state?.gameStatus === 'PLAYING' && phase === 'TURN_ACTIVE' && seconds === 0 && state.endAt && !busy) {
      void markTurnEnded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, phase]);

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

  async function markTurnEnded() {
    if (!state || !game || state.gameStatus !== 'PLAYING' || phase !== 'TURN_ACTIVE' || busy) return;
    setBusy(true);
    beep();
    try {
      await persist({
        ...state,
        phase: 'TURN_ENDED',
        endAt: null,
        pausedRemainingMs: null,
        lastEvent: `⏰ Времето на ${team?.name ?? 'отбора'} изтече.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('turnEnded', { team: team?.name ?? t('player') }));
    } finally {
      setBusy(false);
    }
  }

  async function goToNextTeam() {
    if (!state || !game || !team || phase !== 'TURN_ENDED' || room?.host_user_id !== userId || busy) return;
    setBusy(true);
    setError('');
    try {
      const nextIndex = (state.currentTeamIndex + 1) % state.teamOrder.length;
      const nextState: GameState = { ...state, currentTeamIndex: nextIndex };
      await persist(beginNextTurn(nextState, state.bonusTimeSeconds));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nextTeamFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function goToNextRound() {
    if (!state || !game || phase !== 'ROUND_ENDED' || state.round >= 3 || room?.host_user_id !== userId || busy) return;
    setBusy(true);
    setError('');
    try {
      await persist(beginNextRound(state));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('nextRoundFailed'));
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
    if (!state || !game || !team || !state.currentCard || busy || !isExplainer || phase !== 'TURN_ACTIVE') return;
    if (state.endAt && Date.now() >= new Date(state.endAt).getTime()) {
      await markTurnEnded();
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
          await persist({
            ...nextBase,
            phase: 'ROUND_ENDED',
            currentCard: null,
            currentCardSource: null,
            deck: [],
            passedDeck: [],
            endAt: null,
            pausedRemainingMs: null,
            bonusTimeSeconds: bonus,
            bonusTeamId: bonus > 0 ? team.id : null,
            lastEvent: bonus > 0
              ? `🎉 Рунд ${state.round} приключи! ${team.name} печели ${bonus} сек. бонус за първия си ход в Рунд ${nextRound}.`
              : `🎉 Рунд ${state.round} приключи! Следва Рунд ${nextRound}`,
          });
        } else {
          const winner = [...teams].sort((a, b) => b.score - a.score)[0];
          await persist({ ...nextBase, phase: 'ROUND_ENDED', gameStatus: 'FINISHED', endAt: null, winnerTeamId: winner?.id ?? null, lastEvent: '🏆 Играта приключи!' });
        }
      } else {
        await persist(nextBase);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('markKnownFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function pass() {
    if (!state || !game || !team || !state.currentCard || busy || !isExplainer || phase !== 'TURN_ACTIVE') return;

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
        setError(err instanceof Error ? err.message : t('nextWordFailed'));
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
      const nextCard = remainingPasses > 0 ? (nextDeck.pop() ?? null) : null;
      const fallbackPassed = nextPassed[0] ?? null;
      await persist({
        ...state,
        deck: nextDeck,
        passedDeck: nextPassed,
        currentCard: nextCard ?? fallbackPassed,
        currentCardSource: nextCard ? 'deck' : (fallbackPassed ? 'passed' : null),
        passesRemaining: remainingPasses,
        lastEvent: remainingPasses === 0
          ? `${team.name} използва третия пас — играе с пасуваните думи`
          : `${team.name} пасува`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('passFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function pickPassedCard(cardId: string) {
    if (!state || !game || busy || !isExplainer || phase !== 'TURN_ACTIVE') return;
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
      setError(err instanceof Error ? err.message : t('selectPassedFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    if (!state || !room || userId !== room.host_user_id || busy || (phase !== 'TURN_ACTIVE' && state.gameStatus !== 'PAUSED')) return;
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
      setError(err instanceof Error ? err.message : t('pauseFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!game || !state || !team || !room) {
    return <AppShell><div className="mx-auto max-w-xl px-4 py-20 text-center"><div className="glass rounded-[2rem] p-7">{error ? <div className="font-bold text-rose-600">{error}</div> : <div className="font-bold">{t('loadingGame')}</div>}</div></div></AppShell>;
  }

  const mePlayer = players.find((p) => p.user_id === userId);
  const isCurrentTeam = Boolean(mePlayer && team.playerIds.includes(mePlayer.id));
  const showSecretWords = Boolean(isExplainer);
  const timerDanger = seconds <= 10 && phase === 'TURN_ACTIVE';
  const ranking = [...state.teams].sort((a, b) => b.score - a.score);
  const explainer = players.find((p) => p.id === currentRole?.explainerId);
  const guesser = players.find((p) => p.id === currentRole?.guesserId);
  const passedWords = state.passedDeck;
  const canChoosePassed = isExplainer && phase === 'TURN_ACTIVE';
  const canDrawNewFromPassed = isExplainer && phase === 'TURN_ACTIVE' && state.currentCardSource === 'passed' && state.passesRemaining > 0 && state.deck.length > 0;
  const nextTeam = state.teams.find((t) => t.id === state.teamOrder[(state.currentTeamIndex + 1) % state.teamOrder.length]);

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-3 pb-10 pt-2 sm:px-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-[.12em] text-slate-500">
              <span className="game-chip">{roundEmoji(state.round)} {t('round')} {state.round}</span>
              <span className={`game-chip bg-gradient-to-r ${team.color} text-white border-0`}>{team.name}</span>
            </div>
            <h1 className="game-title text-4xl font-black tracking-tight sm:text-6xl">{state.round === 1 ? t('roundExplanation') : state.round === 2 ? t('roundOneWord') : t('roundMime')}</h1>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button onClick={() => persist({ ...state, soundOn: !state.soundOn })} className="icon-button" aria-label={t('sound')}>
              {state.soundOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            {room.host_user_id === userId && <button onClick={togglePause} className="icon-button" aria-label={t('pause')}>
              {state.gameStatus === 'PAUSED' ? <Play size={19} /> : <Pause size={19} />}
            </button>}
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="game-stat"><Timer size={17} /><span>{t('time')}</span><strong className={timerDanger ? 'text-rose-500' : ''}>{formatTime(seconds)}</strong></div>
          <div className="game-stat"><Flame size={17} /><span>{t('freePasses')}</span><strong>{state.passesRemaining}/3</strong></div>
          <div className="game-stat"><Trophy size={17} /><span>{t('yourScore')}</span><strong>{team.score}</strong></div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className={`game-showcase ${timerDanger && state.gameStatus === 'PLAYING' ? 'timer-danger' : ''}`}>
              <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-3xl" />
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="showcase-kicker">{t('nowPlaying')}</div>
                  <div className="mt-1 flex items-center gap-2 text-lg font-black">{team.name} <ChevronRight size={18} className="opacity-60" /> {nextTeam?.name ?? '—'}</div>
                </div>
                <div className={`timer-orb ${timerDanger ? 'danger' : ''}`}><span>{formatTime(seconds)}</span></div>
              </div>

              <div className="relative z-10 mt-6 rounded-[2rem] bg-white/10 p-2 ring-1 ring-white/15 backdrop-blur-sm sm:p-3">
                <div className="rounded-[1.6rem] bg-white px-5 py-8 text-center text-slate-950 shadow-[0_30px_80px_rgba(11,8,40,.28)] sm:px-10 sm:py-12">
                  <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-black uppercase tracking-[.2em] text-violet-700">
                    <WandSparkles size={14} /> {state.currentCardSource === 'passed' ? t('passedWord') : state.round === 3 ? t('showWithBody') : t('guessWord')}
                  </div>
                  <div className="mt-7 min-h-28 grid place-items-center sm:min-h-36">
                    {phase === 'TURN_ENDED' ? (
                      <div className="text-center">
                        <div className="text-5xl">⏰</div>
                        <div className="mt-3 text-3xl font-black text-slate-950">{t('timeUp')}</div>
                        <div className="mt-1 font-bold text-slate-500">{t('waitHostNextTeam')}</div>
                      </div>
                    ) : phase === 'ROUND_ENDED' ? (
                      <div className="text-center">
                        <div className="text-5xl">🎉</div>
                        <div className="mt-3 text-3xl font-black text-slate-950">{t('roundFinished', { round: state.round })}</div>
                        <div className="mt-1 font-bold text-slate-500">{t('bonusTime', { seconds: state.bonusTimeSeconds })}</div>
                      </div>
                    ) : showSecretWords ? (
                      <div className="word-display break-words">{state.currentCard?.text ?? t('noCard')}</div>
                    ) : (
                      <div className="max-w-xl text-center">
                        <div className="text-5xl">🙈</div>
                        <div className="mt-4 text-2xl font-black text-slate-950">{t('wordHidden')}</div>
                        <div className="mt-2 font-bold text-slate-500">{isCurrentTeam ? t('currentTeamGuesser') : t('otherTeamHidden')}</div>
                      </div>
                    )}
                  </div>
                  {phase === 'TURN_ACTIVE' && showSecretWords && <div className="mt-6 text-sm font-bold leading-6 text-slate-500 sm:text-base">
                    {state.round === 1 ? t('roundOneRule') : state.round === 2 ? t('roundTwoRule') : t('roundThreeRule')}
                  </div>}
                  {phase === 'TURN_ACTIVE' && showSecretWords && state.currentCardSource === 'passed' && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-black text-amber-800">{t('returnedPassed')}</div>}
                </div>
              </div>

              {phase === 'TURN_ACTIVE' && (
                <div className="relative z-10 mt-5 grid grid-cols-2 gap-3">
                  <button
                    onClick={pass}
                    disabled={!isExplainer || busy || (state.currentCardSource === 'passed' ? !canDrawNewFromPassed : state.passesRemaining <= 0) || state.gameStatus !== 'PLAYING'}
                    className="game-action secondary disabled:opacity-35"
                  >
                    <span className="text-2xl">⏭️</span>
                    <span>{state.currentCardSource === 'passed' ? t('newWordButton') : t('passButton')}</span>
                    <small>{state.currentCardSource === 'passed' ? (canDrawNewFromPassed ? t('noPassSpent') : t('guessPassedFirst')) : `${state.passesRemaining} ${t('remaining')}`}</small>
                  </button>
                  <button onClick={correct} disabled={!isExplainer || busy || state.gameStatus !== 'PLAYING'} className="game-action primary disabled:opacity-35">
                    <span className="text-2xl">✅</span><span>{t('knownButton')}</span><small>{state.currentCardSource === 'passed' ? t('oneMorePassAndNew') : t('onePoint')}</small>
                  </button>
                </div>
              )}

              {phase === 'TURN_ENDED' && (
                <div className="relative z-10 mt-5 rounded-[1.5rem] bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-white"><div className="font-black text-lg">{t('next')} {nextTeam?.name ?? '—'}</div><div className="text-sm font-semibold text-white/70">{t('nextTurnStartsAfterButton')}</div></div>
                    <button onClick={goToNextTeam} disabled={room.host_user_id !== userId || busy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950 disabled:opacity-40"><ChevronRight size={18}/>{room.host_user_id === userId ? t('nextTeam') : t('hostChooses')}</button>
                  </div>
                </div>
              )}

              {phase === 'ROUND_ENDED' && (
                <div className="relative z-10 mt-5 rounded-[1.5rem] bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-white"><div className="font-black text-lg">{t('nextRound')} {Math.min(3, state.round + 1)}</div><div className="text-sm font-semibold text-white/70">{state.bonusTimeSeconds > 0 ? `${team.name} ${language === 'en' ? `gets ${state.bonusTimeSeconds}s of bonus time for the first turn only.` : `получава ${state.bonusTimeSeconds} сек. бонус само за първия си ход.`}` : t('everyTurn60')}</div></div>
                    <button onClick={goToNextRound} disabled={room.host_user_id !== userId || busy || state.round >= 3} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950 disabled:opacity-40"><Play size={18}/>{room.host_user_id === userId ? t('nextRound') : t('hostChooses')}</button>
                  </div>
                </div>
              )}

              {!isExplainer && phase === 'TURN_ACTIVE' && <div className="relative z-10 mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-center text-sm font-black text-white ring-1 ring-white/10">{t('hiddenForYou')}</div>}
              {state.gameStatus === 'PAUSED' && <div className="relative z-10 mt-4 rounded-2xl bg-amber-300 px-4 py-3 text-center font-black text-amber-950">{t('gamePaused')}</div>}
            </div>

            {isExplainer && passedWords.length > 0 && (
              <div className={`glass rounded-[2rem] p-4 sm:p-5 ${canChoosePassed ? 'ring-2 ring-amber-400/60' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-black text-lg"><RotateCcw size={18} /> {t('passedWords')} <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{passedWords.length}/3</span></div>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{t('passedWordsHint')}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">{t('passReturned')}</span>
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
                      {state.currentCard?.id === card.id && <span className="absolute right-2 top-2 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-black text-white">{t('now')}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isExplainer && phase === 'TURN_ACTIVE' && (
              <div className="glass rounded-[2rem] p-5 text-center">
                <div className="text-3xl">🔒</div>
                <div className="mt-2 font-black">{t('cardsHidden')}</div>
                <p className="mt-1 text-sm font-semibold text-slate-500">{t('hiddenCardsHint')}</p>
              </div>
            )}

            {error && <div className="rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-600">{error}</div>}

            <div className="glass rounded-[2rem] p-4 sm:p-5">
              <div className="flex flex-wrap gap-2 text-sm font-bold">
                <span className="status-pill"><Sparkles size={14} /> {state.deck.length + state.passedDeck.length + (state.currentCard ? 1 : 0)} {t('cardsInGame')}</span>
                <span className="status-pill">👤 {meName}</span>
                <span className="status-pill">➡️ {t('next')} {nextTeam?.name ?? '—'}</span>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="glass rounded-[2rem] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-black text-lg"><Crown size={18} className="text-amber-500" /> {t('ranking')}</div><div className="text-xs font-black uppercase tracking-wider text-slate-400">{t('total')}</div></div>
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
              <div className="flex items-center justify-between"><div className="font-black">{t('round')} {state.round}</div><div className="text-xs font-black text-slate-400">{t('roundPoints')}</div></div>
              <div className="mt-3 space-y-2">
                {state.teams.map((t) => <div key={t.id} className="flex items-center justify-between rounded-2xl bg-black/[.035] px-3 py-2.5 dark:bg-white/[.05]"><span className="font-bold">{t.name}</span><span className="font-black tabular-nums">{t.roundScores[String(state.round)] ?? 0}</span></div>)}
              </div>
            </div>

            <div className="rounded-[2rem] bg-gradient-to-br from-amber-300 via-orange-300 to-pink-300 p-[1px] shadow-xl">
              <div className="rounded-[1.95rem] bg-white/80 p-5 backdrop-blur dark:bg-slate-950/70">
                <div className="flex items-center gap-2 font-black"><Flame size={18} className="text-orange-500" /> {t('roundRule')}</div>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{state.round === 1 ? t('manyWordsNoRoot') : state.round === 2 ? t('oneHintWord') : t('actNoSound')}</p>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-5 text-center text-xs font-bold text-slate-400">{explainer?.name ?? '—'} {t('explains')} <span className="mx-1">•</span> {guesser?.name ?? '—'} {t('guesses')} <span className="mx-1">•</span> {t('realtime')}</div>
      </section>
    </AppShell>
  );
}
