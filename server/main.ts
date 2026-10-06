import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineRoom, defineServer } from 'colyseus';
import { ROOM_NAME } from '../shared/multiplayer-protocol.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number.parseInt(process.env.PORT ?? '', 10) || 2567;

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(LobbyRoom)
  },
  express: app => {
    app.disable('x-powered-by');
    app.get('/health', (_request, response) => {
      response.json({ ok: true, service: 'command-radius', multiplayer: 'lobby-bootstrap' });
    });
    app.use('/vendor', express.static(path.join(workspaceRoot, 'node_modules', '@colyseus', 'sdk', 'dist')));
    app.use(express.static(workspaceRoot, { extensions: ['html'] }));
  }
});

await server.listen(port);
console.log(`Command Radius listening on http://localhost:${port}`);
