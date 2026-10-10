import type { Client } from 'colyseus';
import { Room } from 'colyseus';
import {
  CLIENT_MESSAGES,
  LOBBY_PHASES,
  MAP_SIZES,
  MAX_COMMANDERS,
  SERVER_MESSAGES
} from '../../shared/multiplayer-protocol.js';
import { canStartLobby, clampAiCount, normalizePlayerName } from '../domain/lobby-policy.js';
import { seedFromRoomCode } from '../game/MultiplayerWorld.js';
import { LobbyPlayer, LobbyState } from '../state/LobbyState.js';

interface JoinOptions {
  playerName?: unknown;
}

export class LobbyRoom extends Room {
  state = new LobbyState();
  maxClients = MAX_COMMANDERS;
  patchRate = 100;
  maxMessagesPerSecond = 30;
  private hostSessionId = '';
  private matchSeed = 1;
  private commandSequence = 0;
  private commandHistory: Array<{
    sequence: number;
    tick: number;
    playerId: number;
    command: { name: string; args: unknown[]; requestId?: string };
  }> = [];

  onCreate(): void {
    this.state.roomCode = this.roomId;
    this.matchSeed = seedFromRoomCode(this.roomId);
    this.setPrivate();
    this.setMetadata({ phase: LOBBY_PHASES.LOBBY, mapSize: 'standard' });

    this.onMessage(CLIENT_MESSAGES.REQUEST_STATE, client => this.sendCurrentState(client));
    this.onMessage(CLIENT_MESSAGES.SET_READY, (client, payload) => this.setReady(client, payload));
    this.onMessage(CLIENT_MESSAGES.SET_MAP, (client, payload) => this.setMap(client, payload));
    this.onMessage(CLIENT_MESSAGES.SET_AI_COUNT, (client, payload) => this.setAiCount(client, payload));
    this.onMessage(CLIENT_MESSAGES.START_MATCH, client => this.startMatch(client));
    this.onMessage(CLIENT_MESSAGES.MATCH_COMMAND, (client, payload) => this.handleMatchCommand(client, payload));
    this.onMessage(CLIENT_MESSAGES.FULL_COMMAND, (client, payload) => this.handleFullCommand(client, payload));
    this.setFixedTimestep(context => this.runMatchTick(context.dt), 30);
  }

  onJoin(client: Client, options: JoinOptions): void {
    if (this.state.phase !== LOBBY_PHASES.LOBBY) throw new Error('This match has already started.');
    const firstPlayer = this.state.players.size === 0;
    const player = new LobbyPlayer({
      sessionId: client.sessionId,
      name: normalizePlayerName(options?.playerName),
      seat: this.nextSeat(),
      ready: false,
      connected: true,
      host: firstPlayer
    });
    this.state.players.set(client.sessionId, player);
    if (firstPlayer) this.hostSessionId = client.sessionId;
    this.fitAiCount();
    this.broadcastSnapshot();
  }

  onDrop(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = false;
      player.ready = false;
      this.broadcastSnapshot();
    }
    this.allowReconnection(client, 60);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.broadcastSnapshot();
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    if (client.sessionId === this.hostSessionId) this.transferHost();
    this.fitAiCount();
    this.broadcastSnapshot();
  }

  private setReady(client: Client, payload: unknown): void {
    if (!this.requireLobby(client)) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = Boolean((payload as { ready?: unknown })?.ready);
    this.broadcastSnapshot();
  }

  private setMap(client: Client, payload: unknown): void {
    if (!this.requireHostInLobby(client)) return;
    const requested = String((payload as { mapSize?: unknown })?.mapSize ?? '');
    if (!MAP_SIZES.includes(requested)) return this.sendError(client, 'Unknown map size.');
    this.state.mapSize = requested;
    this.resetReadiness();
    this.setMetadata({ phase: this.state.phase, mapSize: this.state.mapSize });
    this.broadcastSnapshot();
  }

  private setAiCount(client: Client, payload: unknown): void {
    if (!this.requireHostInLobby(client)) return;
    this.state.aiCount = clampAiCount((payload as { count?: unknown })?.count, this.state.players.size, MAX_COMMANDERS);
    this.resetReadiness();
    this.broadcastSnapshot();
  }

  private startMatch(client: Client): void {
    if (this.state.phase !== LOBBY_PHASES.LOBBY) return this.sendError(client, 'The match is already starting.');
    const members = [...this.state.players.values()].map(player => ({
      sessionId: player.sessionId,
      ready: player.ready,
      connected: player.connected
    }));
    const check = canStartLobby(client.sessionId, this.hostSessionId, members, this.state.aiCount);
    if (!check.ok) return this.sendError(client, check.reason ?? 'The lobby cannot start yet.');

    this.state.phase = LOBBY_PHASES.COUNTDOWN;
    this.state.countdownEndsAt = Date.now() + 3000;
    this.lock();
    this.setMetadata({ phase: this.state.phase, mapSize: this.state.mapSize });
    this.broadcastSnapshot();

    this.clock.setTimeout(() => {
      this.state.phase = LOBBY_PHASES.PLAYING;
      this.state.serverTick = 0;
      this.commandSequence = 0;
      this.commandHistory = [];
      this.setMetadata({ phase: this.state.phase, mapSize: this.state.mapSize });
      const match = this.matchDescriptor();
      this.broadcast(SERVER_MESSAGES.MATCH_STARTED, match);
      this.broadcast(SERVER_MESSAGES.FULL_TICK, { tick: 0, sequence: 0 });
      this.broadcastSnapshot();
    }, 3000);
  }

  private runMatchTick(_dt: number): void {
    if (this.state.phase !== LOBBY_PHASES.PLAYING) return;
    this.state.serverTick++;
    if (this.state.serverTick % 3 === 0) {
      this.broadcast(SERVER_MESSAGES.FULL_TICK, {
        tick: this.state.serverTick,
        sequence: this.commandSequence
      });
    }
    if (this.state.serverTick % 30 === 0) {
      this.broadcast(SERVER_MESSAGES.MATCH_TICK, { tick: this.state.serverTick });
    }
  }

  private handleMatchCommand(client: Client, payload: unknown): void {
    this.handleFullCommand(client, payload);
  }

  private handleFullCommand(client: Client, payload: unknown): void {
    if (this.state.phase !== LOBBY_PHASES.PLAYING) {
      return this.sendError(client, 'The battlefield is not accepting orders.');
    }
    const player = this.state.players.get(client.sessionId);
    const command = payload as { name?: unknown; args?: unknown; requestId?: unknown };
    const name = String(command?.name ?? '');
    if (!player || !player.connected) return this.sendError(client, 'Your commander is not connected.');
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(name) || !Array.isArray(command?.args)) {
      return this.sendError(client, 'Malformed battlefield order.');
    }
    if (command.args.length > 24 || JSON.stringify(command).length > 16384) {
      return this.sendError(client, 'Battlefield order is too large.');
    }
    const envelope = {
      sequence: ++this.commandSequence,
      tick: this.state.serverTick + 12,
      playerId: player.seat,
      command: { name, args: command.args, ...(typeof command.requestId === 'string' && command.requestId.length <= 64 ? { requestId:command.requestId } : {}) }
    };
    this.commandHistory.push(envelope);
    this.broadcast(SERVER_MESSAGES.FULL_COMMAND, envelope);
  }

  private requireLobby(client: Client): boolean {
    if (this.state.phase === LOBBY_PHASES.LOBBY) return true;
    this.sendError(client, 'Lobby settings are locked after Start.');
    return false;
  }

  private requireHostInLobby(client: Client): boolean {
    if (!this.requireLobby(client)) return false;
    if (client.sessionId === this.hostSessionId) return true;
    this.sendError(client, 'Only the lobby host can change this setting.');
    return false;
  }

  private nextSeat(): number {
    const occupied = new Set([...this.state.players.values()].map(player => player.seat));
    for (let seat = 0; seat < MAX_COMMANDERS; seat++) if (!occupied.has(seat)) return seat;
    return MAX_COMMANDERS - 1;
  }

  private fitAiCount(): void {
    this.state.aiCount = clampAiCount(this.state.aiCount, this.state.players.size, MAX_COMMANDERS);
  }

  private resetReadiness(): void {
    this.state.players.forEach(player => { player.ready = false; });
  }

  private transferHost(): void {
    const next = [...this.state.players.values()].sort((a, b) => a.seat - b.seat)[0];
    this.hostSessionId = next?.sessionId ?? '';
    this.state.players.forEach(player => { player.host = player.sessionId === this.hostSessionId; });
  }

  private matchDescriptor() {
    return {
      roomCode: this.roomId,
      mapSize: this.state.mapSize,
      aiCount: this.state.aiCount,
      tickRate: 30,
      seed: this.matchSeed,
      commanderCount: this.state.players.size + this.state.aiCount,
      humanSeats: [...this.state.players.values()].map(player => player.seat).sort((a, b) => a - b),
      players: [...this.state.players.values()]
        .sort((a, b) => a.seat - b.seat)
        .map(player => ({ sessionId: player.sessionId, name: player.name, seat: player.seat }))
    };
  }

  private snapshot() {
    return {
      ...this.matchDescriptor(),
      phase: this.state.phase,
      countdownEndsAt: this.state.countdownEndsAt,
      serverTick: this.state.serverTick,
      hostSessionId: this.hostSessionId,
      players: [...this.state.players.values()]
        .sort((a, b) => a.seat - b.seat)
        .map(player => ({
          sessionId: player.sessionId,
          name: player.name,
          seat: player.seat,
          ready: player.ready,
          connected: player.connected,
          host: player.host
        }))
    };
  }

  private sendCurrentState(client: Client): void {
    client.send(SERVER_MESSAGES.LOBBY_STATE, this.snapshot());
    if (this.state.phase === LOBBY_PHASES.PLAYING) {
      for (const envelope of this.commandHistory) client.send(SERVER_MESSAGES.FULL_COMMAND, envelope);
      client.send(SERVER_MESSAGES.FULL_TICK, {
        tick: this.state.serverTick,
        sequence: this.commandSequence
      });
    }
  }

  private broadcastSnapshot(): void {
    this.broadcast(SERVER_MESSAGES.LOBBY_STATE, this.snapshot());
  }

  private sendError(client: Client, message: string): void {
    client.send(SERVER_MESSAGES.ERROR, { message });
  }
}
