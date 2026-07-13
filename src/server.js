import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from './game/rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const port = Number(process.env.PORT ?? 3000);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = new RoomManager({
  onStateChange: (code) => {
    emitRoom(code);
  }
});

app.use(express.static(publicDir));

io.on('connection', (socket) => {
  let joinedRoomCode = null;

  socket.on('create-room', (payload = {}, reply) => {
    handle(reply, () => {
      const { name } = payload ?? {};
      const room = rooms.createRoom(socket.id, name);
      joinedRoomCode = room.code;
      socket.join(room.code);
      emitRoom(room.code);
      return rooms.getPrivateView(room.code, socket.id);
    });
  });

  socket.on('join-room', (payload = {}, reply) => {
    handle(reply, () => {
      const { code, name } = payload ?? {};
      const room = rooms.joinRoom(code, socket.id, name);
      joinedRoomCode = room.code;
      socket.join(room.code);
      emitRoom(room.code);
      return rooms.getPrivateView(room.code, socket.id);
    });
  });

  socket.on('update-hp', (payload = {}, reply) => {
    handle(reply, () => {
      const { startingHp } = payload ?? {};
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.updateStartingHp(code, socket.id, startingHp);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('start-game', (payload = {}, reply) => {
    handle(getNoPayloadReply(payload, reply), () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.startGame(code, socket.id, payload ?? {});
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('resolve-cards', (payload = {}, reply) => {
    handle(getNoPayloadReply(payload, reply), () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.resolveCards(code, socket.id);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('choose-card', (payload = {}, reply) => {
    handle(reply, () => {
      const { value } = payload ?? {};
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.chooseCard(code, socket.id, value);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('choose-row', (payload = {}, reply) => {
    handle(reply, () => {
      const { rowIndex } = payload ?? {};
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.chooseRow(code, socket.id, rowIndex);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('next-round', (payload = {}, reply) => {
    handle(getNoPayloadReply(payload, reply), () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.nextRound(code, socket.id);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('restart-game', (payload = {}, reply) => {
    handle(getNoPayloadReply(payload, reply), () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.restartGame(code, socket.id);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('disconnect', () => {
    rooms.disconnect(socket.id);
    if (joinedRoomCode) emitRoom(joinedRoomCode);
  });
});

function emitRoom(code) {
  const room = rooms.requireRoom(code);
  for (const player of room.players) {
    io.to(player.id).emit('state', rooms.getPrivateView(code, player.id));
  }
}

function handle(reply, action) {
  const canReply = typeof reply === 'function';

  try {
    const state = action();
    if (canReply) reply({ ok: true, state });
  } catch (error) {
    if (canReply) {
      reply({ ok: false, error: error.message });
      return;
    }

    console.error(error);
  }
}

function getNoPayloadReply(payload, reply) {
  return typeof payload === 'function' ? payload : reply;
}

function requireJoinedRoom(code) {
  if (!code) throw new Error('Join a room first');
  return code;
}

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`6 Nimmt Local running on:`);
  for (const url of getLocalUrls(port)) {
    console.log(`  ${url}`);
  }
});

function getLocalUrls(listenPort) {
  const urls = [`http://localhost:${listenPort}`];
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        urls.push(`http://${address.address}:${listenPort}`);
      }
    }
  }
  return urls;
}
