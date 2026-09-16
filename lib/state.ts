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

function balancedSizes(total: number, maxSize: 2 | 3) {
  const teamCount = Math.max(1, Math.ceil(total / maxSize));
  const base = Math.floor(total / teamCount);
  const extra = total % teamCount;
  return Array.from({ length: teamCount }, (_, index) => base + (index < extra ? 1 : 0));
}

export function buildGameState(room: Room, players: Player[]): GameState {
  const shuffledPlayers = shuffle(players);
  const sizes = balancedSizes(players.length, room.team_size);
  const teams: Team[] = [];
  let cursor = 0;

  sizes.forEach((size, index) => {
    const teamPlayers = shuffledPlayers.slice(cursor, cursor + size);
    cursor += size;
    teams.push({
      id: crypto.randomUUID(),
      name: `Отбор ${index + 1}`,
      color: TEAM_PALETTE[index % TEAM_PALETTE.length],
      playerIds: teamPlayers.map((player) => player.id),
      score: 0,
      roundScores: { '1': 0, '2': 0, '3': 0 },
      turnNumber: 0,
    });
  });

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
    version: 1,
    gameStatus: 'PLAYING',
    round: 1,
    teams,
    teamOrder: teams.map((team) => team.id),
    currentTeamIndex: 0,
    currentCard,
    deck,
    passedDeck: [],
    allCards,
    passesRemaining: 3,
    turnStartedAt: new Date(now).toISOString(),
    endAt: new Date(now + initialSeconds * 1000).toISOString(),
    pausedRemainingMs: null,
    bonusTimeSeconds: 0,
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
  return {
    ...state,
    gameStatus: 'PLAYING',
    passesRemaining: 3,
    currentCard: drawCard(state),
    turnStartedAt: new Date(now).toISOString(),
    endAt: new Date(now + seconds * 1000).toISOString(),
    pausedRemainingMs: null,
    lastEvent: `${team.name} играе`,
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
