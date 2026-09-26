'use client';

import Link from 'next/link';
import { Check, Crown, LogOut, Play, Plus, Trash2, Users, Wifi } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { QRCodeBox } from '@/components/QRCodeBox';
import { WordInputForm } from '@/components/WordInputForm';
import {
  createGame,
  createRoomTeam,
  deleteRoomTeam,
  getRoomByCode,
  loadPlayers,
  loadRoomTeams,
  setReady,
  setTeamChoice,
  submitWords as submitWordsFn,
} from '@/lib/repo';
import { ensureAnonymousSession } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { areManualTeamsBalanced, buildGameState, requiredTeamCount } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import type { Player, Room, RoomTeam } from '@/lib/types';

export default function RoomPage() {
  const { t } = useLanguage();
  const params = useParams<{ roomCode: string }>();
  const router = useRouter();
  const code = String(params.roomCode ?? '').toUpperCase();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomTeams, setRoomTeams] = useState<RoomTeam[]>([]);
  const [userId, setUserId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [error, setError] = useState('');

  const me = useMemo(() => players.find((p) => p.user_id === userId), [players, userId]);
  const manualMode = (room?.team_assignment_mode ?? 'RANDOM') === 'MANUAL';
  const neededTeamCount = room ? requiredTeamCount(players.length, room.team_size) : 1;
  const teamCounts = useMemo(
    () => new Map(roomTeams.map((team) => [team.id, players.filter((player) => player.team_choice === team.id).length])),
    [roomTeams, players],
  );
  const allReady = players.length >= 4 && players.every((p) => p.ready && p.words);
  const teamsReady = !manualMode || (room ? areManualTeamsBalanced(players, room, roomTeams) : false);

  useEffect(() => {
    let alive = true;
    async function init() {
      try {
        const session = await ensureAnonymousSession();
        if (!session?.user?.id) throw new Error(t('invalidGameSession'));
        const foundRoom = await getRoomByCode(code);
        if (!foundRoom) throw new Error(t('roomDoesNotExist'));
        const [foundPlayers, foundTeams] = await Promise.all([
          loadPlayers(foundRoom.id),
          foundRoom.team_assignment_mode === 'MANUAL' ? loadRoomTeams(foundRoom.id) : Promise.resolve([]),
        ]);
        if (!foundPlayers.some((p) => p.user_id === session.user.id)) {
          router.replace(`/join/${foundRoom.code}`);
          return;
        }
        if (!alive) return;
        setUserId(session.user.id);
        setRoom(foundRoom);
        setPlayers(foundPlayers);
        setRoomTeams(foundTeams as RoomTeam[]);
        setLoading(false);
        if (foundRoom.game_id) router.replace(`/game/${foundRoom.game_id}`);
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : t('genericError'));
          setLoading(false);
        }
      }
    }
    void init();
    return () => { alive = false; };
  }, [code, router, t]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase.channel(`room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, async () => {
        setPlayers(await loadPlayers(room.id));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_teams', filter: `room_id=eq.${room.id}` }, async () => {
        setRoomTeams(await loadRoomTeams(room.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        const next = payload.new as Room;
        setRoom(next);
        if (next.game_id) router.replace(`/game/${next.game_id}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room, router]);

  async function submitWords(words: Parameters<typeof submitWordsFn>[1]) {
    await submitWordsFn(room!.id, words);
  }

  async function chooseTeam(teamId: string) {
    if (!room || !me) return;
    const count = teamCounts.get(teamId) ?? 0;
    const selected = me.team_choice === teamId;
    const maxTeamSize = room.team_size + 1;

    if (selected) {
      setError('');
      await setTeamChoice(room.id, null);
      return;
    }
    if (count >= maxTeamSize) {
      setError(`${t('teamFull')} ${t('maxLobby')} ${maxTeamSize} ${t('players')}.`);
      return;
    }

    setError('');
    await setTeamChoice(room.id, teamId);
  }

  async function createTeam() {
    if (!room || !me || !manualMode) return;
    if (teamName.trim().length < 2) {
      setError(t('writeTeamName'));
      return;
    }
    setCreatingTeam(true);
    setError('');
    try {
      await createRoomTeam(room.id, teamName);
      setTeamName('');
      setRoomTeams(await loadRoomTeams(room.id));
      setPlayers(await loadPlayers(room.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setCreatingTeam(false);
    }
  }

  async function removeTeam(team: RoomTeam) {
    if (!room || !me) return;
    const count = teamCounts.get(team.id) ?? 0;
    if (count > 0) {
      setError(t('leaveFirst'));
      return;
    }
    if (team.created_by !== userId && !me.is_host) return;
    try {
      await deleteRoomTeam(team.id);
      setRoomTeams(await loadRoomTeams(room.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    }
  }

  async function startGame() {
    if (!room || !allReady || !teamsReady || !me?.is_host) return;
    setStarting(true);
    setError('');
    try {
      const state = buildGameState(room, players, roomTeams);
      const game = await createGame(room, state);
      router.replace(`/game/${game.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
      setStarting(false);
    }
  }

  if (loading) return <AppShell><div className="mx-auto max-w-5xl px-4 py-20 text-center font-bold">{t('loadingRoom')}</div></AppShell>;
  if (error && !room) return <AppShell><div className="mx-auto max-w-xl px-4 py-20"><div className="glass rounded-3xl p-6"><div className="font-black text-rose-600">{error}</div><Link href="/" className="mt-4 inline-block font-bold underline">{t('home')}</Link></div></div></AppShell>;
  if (!room || !me) return null;

  const readyCount = players.filter((p) => p.ready).length;

  return <AppShell><section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-sm font-bold text-gray-500">{t('roomLabel')} · {room.code}</div>
        <h1 className="mt-1 text-4xl font-black tracking-tight">{t('prepare')}</h1>
        <p className="mt-2 text-gray-600">{t('prepareDesc')}</p>
      </div>
      <div className="rounded-2xl bg-white/70 px-4 py-3 text-center shadow-sm"><div className="text-2xl font-black">{players.length}</div><div className="text-xs font-bold text-gray-500">{t('players')}</div></div>
    </div>

    <div className="mt-8 grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
      <div className="space-y-4">
        <QRCodeBox code={room.code}/>
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black"><Wifi size={18}/> {t('online')}</div><div className="text-sm font-bold text-gray-500">{readyCount}/{players.length} {t('ready').toLowerCase()}</div></div>
          <div className="mt-4 space-y-2">
            {players.map((p) => {
              const team = roomTeams.find((item) => item.id === p.team_choice);
              return <div key={p.id} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-black text-xs font-black text-white">{p.name.slice(0,2).toUpperCase()}</div>
                  <span className="font-bold">{p.name}{p.user_id===userId && ` ${t('you')}`}</span>
                  {p.is_host&&<Crown size={15} className="text-amber-500"/>}
                </div>
                <div className="flex items-center gap-2">
                  {manualMode && team && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">{team.name}</span>}
                  {p.ready?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-600"><Check size={13}/> {t('ready')}</span>:<span className="text-xs font-semibold text-gray-400">{t('enteringWords')}</span>}
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {manualMode && <div className="glass rounded-3xl p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-black"><Users size={19}/> {t('createTeams')}</div>
              <p className="mt-1 text-sm font-semibold text-gray-500">{t('createTeamsDesc')}</p>
            </div>
            <div className="shrink-0 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{roomTeams.length} {t('teams')}</div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createTeam(); } }}
              maxLength={20}
              disabled={creatingTeam}
              placeholder={t('teamNamePlaceholder')}
              className="min-w-0 flex-1 rounded-2xl border border-black/10 bg-white/80 px-4 py-3.5 font-semibold outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
            />
            <button onClick={() => void createTeam()} disabled={creatingTeam} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3.5 font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
              <Plus size={18}/>{creatingTeam ? t('creatingTeam') : t('createTeam')}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {roomTeams.map((team) => {
              const members = players.filter((player) => player.team_choice === team.id);
              const selected = me.team_choice === team.id;
              const maxLobbySize = room.team_size + 1;
              const creator = players.find((player) => player.user_id === team.created_by);
              return <div key={team.id} className={`rounded-2xl border p-4 transition ${selected ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-500/10' : 'border-black/10 bg-white/60'}`}>
                <button type="button" onClick={() => void chooseTeam(team.id)} disabled={!selected && members.length >= maxLobbySize} className="w-full text-left disabled:cursor-not-allowed disabled:opacity-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-black">{team.name}</div>
                      <div className="mt-0.5 text-xs font-semibold text-gray-400">{t('teamCreatedBy')} {creator?.name ?? t('player')}</div>
                    </div>
                    <div className="text-sm font-black text-gray-500">{members.length}/{maxLobbySize}</div>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-gray-600">{members.map((player) => player.name).join(' · ') || t('noPlayers')}</div>
                  {selected && <div className="mt-3 text-xs font-black text-indigo-700">✓ {t('youAreInTeam')}</div>}
                </button>
                {members.length === 0 && (team.created_by === userId || me.is_host) && <button onClick={() => void removeTeam(team)} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-rose-600"><Trash2 size={13}/> {t('deleteTeam')}</button>}
              </div>;
            })}
          </div>

          <div className="mt-4 rounded-2xl bg-black/[0.03] px-4 py-3 text-sm font-semibold text-gray-500">
            {teamsReady ? `✅ ${t('teamsBalanced')}` : t('teamsNeedBalanced', { count: neededTeamCount })}
          </div>
        </div>}

        <div className="glass rounded-3xl p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-2 font-black"><Users size={19}/> {t('your12Words')}</div>
          {me.ready ? <div className="rounded-3xl bg-emerald-50 p-6 text-center"><div className="text-4xl">✅</div><div className="mt-3 text-xl font-black">{t('readyYou')}</div><p className="mt-1 text-sm text-emerald-700">{t('waitOthers')}</p><button onClick={()=>setReady(room.id,false)} className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-bold shadow-sm">{t('editWords')}</button></div> : <WordInputForm onSubmit={submitWords}/>}</div>
      </div>
    </div>

    {error && <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 font-semibold text-rose-600">{error}</div>}

    <div className="mt-6 glass rounded-3xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-black">{manualMode ? t('freeTeamFormation') : t('randomTeamFormation')} · {t('teamSizeLabel')} {room.team_size}</div>
          <div className="mt-1 text-sm text-gray-500">{manualMode ? t('playersChooseTeams') : t('appRandomizes')}</div>
        </div>
        {me.is_host ? <button onClick={startGame} disabled={!allReady||!teamsReady||starting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-6 py-4 font-black text-white shadow-xl disabled:cursor-not-allowed disabled:opacity-40"><Play size={18}/>{starting?t('starting'):t('startGame')}</button> : <div className="inline-flex items-center gap-2 text-sm font-bold text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-amber-400 pulse-soft"/> {t('waitingHost')}</div>}
      </div>
    </div>

    <div className="mt-4 text-center"><button className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-rose-600"><LogOut size={15}/> {t('exit')}</button></div>
  </section></AppShell>;
}
