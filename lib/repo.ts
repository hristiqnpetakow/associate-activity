import { supabase } from './supabase';
import { ensureAnonymousSession } from './auth';
import type { GameRow, GameState, Player, Room, RoomTeam, TeamAssignmentMode, WordInput } from './types';

export async function getSessionUserId() {
  const session = await ensureAnonymousSession();
  if (!session?.user?.id) throw new Error('Не успяхме да създадем сесия.');
  return session.user.id;
}

function friendlyError(error: { message: string }) {
  if (error.message.includes('duplicate key')) return 'Това име вече се използва в стаята.';
  return error.message;
}

export async function createRoom(name: string, teamSize: 2 | 3, teamAssignmentMode: TeamAssignmentMode = 'RANDOM') {
  const userId = await getSessionUserId();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ code, host_user_id: userId, team_size: teamSize, team_assignment_mode: teamAssignmentMode, status: 'LOBBY' })
      .select('*')
      .single();
    if (!error && room) {
      const { error: playerError } = await supabase.from('players').insert({
        room_id: room.id,
        user_id: userId,
        name: name.trim(),
        is_host: true,
      });
      if (playerError) throw new Error(friendlyError(playerError));
      return room as Room;
    }
  }
  throw new Error('Не успяхме да създадем уникален код. Опитай отново.');
}

export async function getRoomByCode(code: string) {
  await getSessionUserId();
  const { data, error } = await supabase.rpc('get_room_by_code', { p_code: code.toUpperCase() });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as Room;
}

export async function joinRoom(roomId: string, name: string) {
  const userId = await getSessionUserId();
  const { data, error } = await supabase.from('players').upsert({
    room_id: roomId,
    user_id: userId,
    name: name.trim(),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'room_id,user_id' }).select('*').single();
  if (error) throw new Error(friendlyError(error));
  return data as Player;
}

export async function loadPlayers(roomId: string) {
  const { data, error } = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Player[];
}

export async function loadRoom(roomId: string) {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (error) throw new Error(error.message);
  return data as Room;
}

export async function submitWords(roomId: string, words: WordInput) {
  const userId = await getSessionUserId();
  const { error } = await supabase.from('players').update({ words, ready: true, last_seen_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}



export async function loadRoomTeams(roomId: string) {
  const { data, error } = await supabase
    .from('room_teams')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as RoomTeam[];
}

export async function createRoomTeam(roomId: string, name: string) {
  const userId = await getSessionUserId();
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    throw new Error('Името на отбора трябва да е между 2 и 20 символа.');
  }
  const { data, error } = await supabase
    .from('room_teams')
    .insert({ room_id: roomId, name: trimmed, created_by: userId })
    .select('*')
    .single();
  if (error) throw new Error(error.message.includes('duplicate key') ? 'Вече има отбор с това име.' : error.message);

  const { error: playerError } = await supabase
    .from('players')
    .update({ team_choice: data.id, last_seen_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (playerError) {
    await supabase.from('room_teams').delete().eq('id', data.id);
    throw new Error(playerError.message);
  }

  return data as RoomTeam;
}

export async function deleteRoomTeam(teamId: string) {
  const { error } = await supabase.from('room_teams').delete().eq('id', teamId);
  if (error) throw new Error(error.message);
}

export async function setTeamChoice(roomId: string, teamChoice: string | null) {
  const userId = await getSessionUserId();
  const { error } = await supabase
    .from('players')
    .update({ team_choice: teamChoice, last_seen_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function setReady(roomId: string, ready: boolean) {
  const userId = await getSessionUserId();
  const { error } = await supabase.from('players').update({ ready, last_seen_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function createGame(room: Room, state: GameState) {
  const { data, error } = await supabase.from('games').insert({ room_id: room.id, state }).select('*').single();
  if (error) throw new Error(error.message);
  const { error: roomError } = await supabase.from('rooms').update({ status: 'PLAYING', game_id: data.id }).eq('id', room.id).eq('host_user_id', room.host_user_id);
  if (roomError) throw new Error(roomError.message);
  return data as GameRow;
}

export async function loadGame(gameId: string) {
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single();
  if (error) throw new Error(error.message);
  return data as GameRow;
}

export async function saveGameState(game: GameRow, state: GameState) {
  const { data, error } = await supabase.from('games').update({ state, updated_at: new Date().toISOString(), finished_at: state.gameStatus === 'FINISHED' ? new Date().toISOString() : null }).eq('id', game.id).select('*').single();
  if (error) throw new Error(error.message);
  return data as GameRow;
}

export async function setRoomStatus(roomId: string, status: Room['status']) {
  const { error } = await supabase.from('rooms').update({ status }).eq('id', roomId);
  if (error) throw new Error(error.message);
}

export async function touchPlayer(roomId: string) {
  const userId = await getSessionUserId();
  await supabase.from('players').update({ last_seen_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', userId);
}

export async function leaveRoom(roomId: string) {
  const userId = await getSessionUserId();
  await supabase.from('players').delete().eq('room_id', roomId).eq('user_id', userId);
}
