export interface LobbyMember {
  sessionId: string;
  ready: boolean;
  connected: boolean;
}

export interface StartCheck {
  ok: boolean;
  reason?: string;
}

export function normalizePlayerName(value: unknown): string {
  const collapsed = String(value ?? '').trim().replace(/\s+/g, ' ');
  return collapsed.slice(0, 24) || 'Commander';
}

export function clampAiCount(value: unknown, humanCount: number, maxCommanders = 5): number {
  const numeric = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
  return Math.max(0, Math.min(numeric, Math.max(0, maxCommanders - humanCount)));
}

export function canStartLobby(
  requesterSessionId: string,
  hostSessionId: string,
  members: LobbyMember[],
  aiCount: number
): StartCheck {
  if (requesterSessionId !== hostSessionId) return { ok: false, reason: 'Only the lobby host can start the match.' };
  const connected = members.filter(member => member.connected);
  if (connected.length !== members.length) return { ok: false, reason: 'Wait for disconnected commanders to return or leave.' };
  if (connected.length + aiCount < 2) return { ok: false, reason: 'At least two commanders are required.' };
  if (connected.some(member => !member.ready)) return { ok: false, reason: 'Every human commander must be ready.' };
  return { ok: true };
}
