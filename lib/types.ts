export type Round = 1 | 2 | 3;
export type GameStatus = 'LOBBY' | 'WORD_INPUT' | 'PLAYING' | 'PAUSED' | 'FINISHED';

export type Player = {
  id: string;
  user_id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  ready: boolean;
  words: WordInput | null;
  joined_at: string;
  last_seen_at: string;
};

export type WordInput = {
  предмети: string[];
  животни: string[];
  личности: string[];
  професии: string[];
};

export type Card = {
  id: string;
  text: string;
  category: string;
};

export type CardSource = 'deck' | 'passed' | null;

export type Team = {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  score: number;
  roundScores: Record<string, number>;
  turnNumber: number;
};

export type GameState = {
  version: number;
  gameStatus: GameStatus;
  round: Round;
  teams: Team[];
  teamOrder: string[];
  currentTeamIndex: number;
  currentCard: Card | null;
  currentCardSource?: CardSource;
  deck: Card[];
  passedDeck: Card[];
  allCards: Card[];
  passesRemaining: number;
  turnStartedAt: string | null;
  endAt: string | null;
  pausedRemainingMs: number | null;
  bonusTimeSeconds: number;
  soundOn: boolean;
  lastEvent: string | null;
  roundStartedAt: string | null;
  winnerTeamId: string | null;
};

export type GameRow = {
  id: string;
  room_id: string;
  state: GameState;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type Room = {
  id: string;
  code: string;
  host_user_id: string;
  team_size: 2 | 3;
  status: GameStatus;
  game_id: string | null;
  created_at: string;
};
