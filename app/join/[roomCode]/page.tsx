import JoinPage from '@/app/join/page';

export default async function JoinRoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return <JoinPage initialCode={roomCode.toUpperCase()} />;
}
