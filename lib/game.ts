import type { GameState, Player, Team } from './types';

export const TEAM_PALETTE = [
  { name: 'Сини', color: 'from-sky-500 to-indigo-600' },
  { name: 'Червени', color: 'from-rose-500 to-orange-500' },
  { name: 'Зелени', color: 'from-emerald-500 to-teal-600' },
  { name: 'Жълти', color: 'from-amber-400 to-yellow-500' },
  { name: 'Лилави', color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Розови', color: 'from-pink-500 to-rose-500' },
];

export function roleForTeam(team: Team, turnNumber: number) {
  if (team.playerIds.length < 2) return { explainerId: team.playerIds[0], guesserId: team.playerIds[0] };
  const explainerIndex = turnNumber % team.playerIds.length;
  const guesserIndex = (explainerIndex + 1) % team.playerIds.length;
  return {
    explainerId: team.playerIds[explainerIndex],
    guesserId: team.playerIds[guesserIndex],
  };
}

export function getCurrentTeam(state: GameState) {
  return state.teams.find((team) => team.id === state.teamOrder[state.currentTeamIndex]) ?? null;
}

export function getRoundRules(round: 1 | 2 | 3) {
  if (round === 1) return 'Обяснявай с неограничен брой думи.';
  if (round === 2) return 'Само една подсказваща дума. Без изречения.';
  return 'Само жестове, мимики и пантомима. Без говорене и звуци.';
}
