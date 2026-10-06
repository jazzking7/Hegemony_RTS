import { schema, t, type SchemaType } from '@colyseus/schema';

export const LobbyPlayer = schema({
  sessionId: t.string(),
  name: t.string(),
  seat: t.uint8().default(0),
  ready: t.boolean().default(false),
  connected: t.boolean().default(true),
  host: t.boolean().default(false)
}, 'LobbyPlayer');
export type LobbyPlayer = SchemaType<typeof LobbyPlayer>;

export const LobbyState = schema({
  roomCode: t.string(),
  phase: t.string().default('lobby'),
  mapSize: t.string().default('standard'),
  aiCount: t.uint8().default(0),
  countdownEndsAt: t.float64().default(0),
  serverTick: t.uint32().default(0),
  players: t.map(LobbyPlayer)
}, 'LobbyState');
export type LobbyState = SchemaType<typeof LobbyState>;
