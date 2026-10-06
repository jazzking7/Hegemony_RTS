export const ROOM_NAME = 'command_lobby';

export const CLIENT_MESSAGES = Object.freeze({
  REQUEST_STATE: 'request_state',
  SET_READY: 'set_ready',
  SET_MAP: 'set_map',
  SET_AI_COUNT: 'set_ai_count',
  START_MATCH: 'start_match'
});

export const SERVER_MESSAGES = Object.freeze({
  LOBBY_STATE: 'lobby_state',
  MATCH_STARTED: 'match_started',
  MATCH_TICK: 'match_tick',
  ERROR: 'command_error'
});

export const LOBBY_PHASES = Object.freeze({
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing'
});

export const MAP_SIZES = Object.freeze(['standard', 'large']);
export const MAX_COMMANDERS = 5;
