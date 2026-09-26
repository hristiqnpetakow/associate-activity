import { shuffle } from './utils';
import { roleForTeam } from './game';
import type { Card, GameState, Player, Room, Team } from './types';

const TEAM_PALETTE = [
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-orange-500',
  'from-emerald-500 to-teal-600',
  'from-amber-400 to-yellow-500',
  'from-violet-500 to-fuchsia-500',
  'from-pink-500 to-rose-500',
];

const TEAM_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З'];

export function requiredTeamCount(total: number, maxSize: 2 | 3) {
  return Math.max(1, Math.ceil(total / maxSize));
}

export function teamKeys(total: number, maxSize: 2 | 3) {
  return Array.from({ length: requiredTeamCount(total, maxSize) }, (_, index) => `team-${index + 1}`);
}

export function teamLabel(index: number) {
  return `Отбор ${TEAM_LETTERS[index] ?? index + 1}`;
}

export function areManualTeamsBalanced(players: Player[], room: Room) {
  const keys = teamKeys(players.length, room.team_size);
  const counts = keys.map((key) => players.filter((player) => player.team_choice === key).length);
  if (counts.some((count) => count === 0)) return false;
  return Math.max(...counts) - Math.min(...counts) <= 1;
}

function balancedSizes(total: number, maxSize: 2 | 3) {
  const teamCount = requiredTeamCount(total, maxSize);
  const base = Math.floor(total / teamCount);
  const extra = total % teamCount;
  return Array.from({ length: teamCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function buildTeams(room: Room, players: Player[]) {
  const teams: Team[] = [];

  if ((room.team_assignment_mode ?? 'RANDOM') === 'MANUAL') {
    const keys = teamKeys(players.length, room.team_size);
    if (!areManualTeamsBalanced(players, room)) {
      throw new Error('Разпредели всички играчи равномерно по отборите преди да започнете.');
    }

    keys.forEach((key, index) => {
      const teamPlayers = players.filter((player) => player.team_choice === key);
      teams.push({
        id: crypto.randomUUID(),
        name: teamLabel(index),
        color: TEAM_PALETTE[index % TEAM_PALETTE.length],
        playerIds: teamPlayers.map((player) => player.id),
        score: 0,
        roundScores: { '1': 0, '2': 0, '3': 0 },
        turnNumber: 0,
      });
    });
    return teams;
  }

  const shuffledPlayers = shuffle(players);
  const sizes = balancedSizes(players.length, room.team_size);
  let cursor = 0;
  sizes.forEach((size, index) => {
    const teamPlayers = shuffledPlayers.slice(cursor, cursor + size);
    cursor += size;
    teams.push({
      id: crypto.randomUUID(),
      name: teamLabel(index),
      color: TEAM_PALETTE[index % TEAM_PALETTE.length],
      playerIds: teamPlayers.map((player) => player.id),
      score: 0,
      roundScores: { '1': 0, '2': 0, '3': 0 },
      turnNumber: 0,
    });
  });
  return teams;
}

export function buildGameState(room: Room, players: Player[]): GameState {
  const teams = buildTeams(room, players);

  const categoryMap: [keyof NonNullable<Player['words']>, string][] = [
    ['предмети', 'Предмет'],
    ['животни', 'Животно'],
    ['личности', 'Личност'],
    ['професии', 'Професия'],
  ];
  const allCards: Card[] = players.flatMap((player) => {
    if (!player.words) return [];
    return categoryMap.flatMap(([key, category]) => player.words?.[key].map((text) => ({
      id: crypto.randomUUID(),
      text,
      category,
    })) ?? []);
  });
  const deck = shuffle(allCards);
  const currentCard = deck.pop() ?? null;
  const now = Date.now();
  const firstTeam = teams[0];
  const initialSeconds = 60;
  const firstRole = firstTeam ? roleForTeam(firstTeam, firstTeam.turnNumber) : { explainerId: '', guesserId: '' };

  return {
    version: 2,
    gameStatus: 'PLAYING',
    phase: 'TURN_ACTIVE',
    round: 1,
    teams,
    teamOrder: teams.map((team) => team.id),
    currentTeamIndex: 0,
    currentCard,
    currentCardSource: currentCard ? 'deck' : null,
    deck,
    passedDeck: [],
    allCards,
    passesRemaining: 3,
    turnStartedAt: new Date(now).toISOString(),
    endAt: new Date(now + initialSeconds * 1000).toISOString(),
    pausedRemainingMs: null,
    bonusTimeSeconds: 0,
    bonusTeamId: null,
    soundOn: true,
    lastEvent: firstRole.explainerId ? `Започва ${firstTeam?.name}` : null,
    roundStartedAt: new Date(now).toISOString(),
    winnerTeamId: null,
  };
}

export function beginNextTurn(state: GameState, bonusTimeSeconds = 0): GameState {
  const team = state.teams.find((item) => item.id === state.teamOrder[state.currentTeamIndex]);
  if (!team) return state;

  team.turnNumber += 1;
  const seconds = 60 + bonusTimeSeconds;
  const now = Date.now();
  const currentId = state.currentCard?.id;
  const currentIsAlreadyPassed = Boolean(currentId && state.passedDeck.some((card) => card.id === currentId));
  const recycledCards = [
    ...state.deck,
    ...state.passedDeck,
    ...(state.currentCard && !currentIsAlreadyPassed ? [state.currentCard] : []),
  ];
  const deck = shuffle(recycledCards);
  const currentCard = deck.pop() ?? null;

  return {
    ...state,
    phase: 'TURN_ACTIVE',
    gameStatus: 'PLAYING',
    passesRemaining: 3,
    currentCard,
    currentCardSource: currentCard ? 'deck' : null,
    deck,
    passedDeck: [],
    turnStartedAt: new Date(now).toISOString(),
    endAt: new Date(now + seconds * 1000).toISOString(),
    pausedRemainingMs: null,
    lastEvent: `${team.name} играе`,
  };
}

export function beginNextRound(state: GameState): GameState {
  const nextRound = (state.round + 1) as 1 | 2 | 3;
  const newDeck = shuffle([...state.allCards]);
  const first = newDeck.pop() ?? null;
  const now = Date.now();
  const bonusSeconds = Math.max(0, state.bonusTimeSeconds);
  const bonusTeamIndex = state.bonusTeamId
    ? state.teamOrder.indexOf(state.bonusTeamId)
    : -1;
  const currentTeamIndex = bonusSeconds > 0 && bonusTeamIndex >= 0 ? bonusTeamIndex : 0;
  const duration = 60 + bonusSeconds;

  return {
    ...state,
    phase: 'TURN_ACTIVE',
    gameStatus: 'PLAYING',
    round: nextRound,
    currentTeamIndex,
    deck: newDeck,
    passedDeck: [],
    currentCard: first,
    currentCardSource: first ? 'deck' : null,
    passesRemaining: 3,
    turnStartedAt: new Date(now).toISOString(),
    endAt: new Date(now + duration * 1000).toISOString(),
    pausedRemainingMs: null,
    bonusTimeSeconds: 0,
    bonusTeamId: null,
    roundStartedAt: new Date(now).toISOString(),
    lastEvent: bonusSeconds > 0
      ? `🚀 Започва Рунд ${nextRound} с ${duration} секунди за ${state.teams[bonusTeamIndex]?.name ?? 'отбора'}.`
      : `🚀 Започва Рунд ${nextRound}`,
  };
}

export function drawCard(state: GameState) {
  if (state.deck.length > 0) return state.deck[state.deck.length - 1];
  if (state.passedDeck.length > 0) return state.passedDeck[state.passedDeck.length - 1];
  return null;
}

export function removeCurrentCard(state: GameState): GameState {
  const cardId = state.currentCard?.id;
  if (!cardId) return state;
  const deck = state.deck.filter((card) => card.id !== cardId);
  const passedDeck = state.passedDeck.filter((card) => card.id !== cardId);
  return { ...state, deck, passedDeck, currentCard: drawCard({ ...state, deck, passedDeck }) };
}
