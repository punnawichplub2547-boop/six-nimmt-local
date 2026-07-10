# 6 Nimmt Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a same-Wi-Fi multiplayer 6 nimmt! web app for 2-4 friends with private hands, short room codes, classic rules, and original classic-feeling card art.

**Architecture:** Use a small Node.js server with Socket.IO for real-time rooms. Keep 6 nimmt! game rules in pure, testable modules, keep room/session management separate, and keep the browser frontend as static files served by Express.

**Tech Stack:** Node.js, Express, Socket.IO, built-in `node:test`, plain HTML/CSS/JavaScript.

---

## File Structure

- `package.json`: project scripts and dependencies.
- `src/game/rules.js`: pure 6 nimmt! card, deck, scoring, row, and turn-resolution logic.
- `src/game/rules.test.js`: rule tests for penalty values, dealing, placement, row taking, low-card choices, and round/game end.
- `src/game/rooms.js`: room creation, joining, host permissions, private/public state filtering, player choices, and row-choice continuation.
- `src/game/rooms.test.js`: room lifecycle and private-state tests.
- `src/server.js`: Express static server and Socket.IO event handlers.
- `public/index.html`: single-page app shell.
- `public/styles.css`: responsive Split Panel layout and original 6 nimmt!-inspired card styling.
- `public/client.js`: browser state rendering and Socket.IO client interactions.

---

### Task 1: Scaffold Node Project

**Files:**
- Create: `package.json`
- Create: `src/game/rules.js`
- Create: `src/game/rules.test.js`

- [x] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "six-nimmt-local-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {}
}
```

- [x] **Step 2: Install dependencies**

Run:

```powershell
npm install
```

Expected: `node_modules` and `package-lock.json` are created.

- [x] **Step 3: Add a first failing rules test**

Create `src/game/rules.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBullCount } from './rules.js';

test('getBullCount returns classic 6 nimmt penalty values', () => {
  assert.equal(getBullCount(55), 7);
  assert.equal(getBullCount(22), 5);
  assert.equal(getBullCount(20), 3);
  assert.equal(getBullCount(25), 2);
  assert.equal(getBullCount(17), 1);
});
```

- [x] **Step 4: Add minimal rules module**

Create `src/game/rules.js`:

```js
export function getBullCount(value) {
  if (value === 55) return 7;
  if (value % 11 === 0) return 5;
  if (value % 10 === 0) return 3;
  if (value % 5 === 0) return 2;
  return 1;
}
```

- [x] **Step 5: Verify tests pass**

Run:

```powershell
npm test
```

Expected: one passing test file.

---

### Task 2: Implement Pure Game Rules

**Files:**
- Modify: `src/game/rules.js`
- Modify: `src/game/rules.test.js`

- [x] **Step 1: Replace rules tests with full rule coverage**

Replace `src/game/rules.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCardToRows,
  createDeck,
  createRound,
  dealHands,
  getBullCount,
  getRowPenalty,
  resolvePlayedCards
} from './rules.js';

function fixedRng() {
  return 0.42;
}

test('getBullCount returns classic 6 nimmt penalty values', () => {
  assert.equal(getBullCount(55), 7);
  assert.equal(getBullCount(22), 5);
  assert.equal(getBullCount(20), 3);
  assert.equal(getBullCount(25), 2);
  assert.equal(getBullCount(17), 1);
});

test('createDeck creates 104 unique numbered cards with bull counts', () => {
  const deck = createDeck();
  assert.equal(deck.length, 104);
  assert.equal(new Set(deck.map((card) => card.value)).size, 104);
  assert.deepEqual(deck[54], { value: 55, bulls: 7 });
});

test('dealHands deals sorted private hands and leaves starting rows', () => {
  const deck = createDeck();
  const result = dealHands(deck, ['p1', 'p2']);
  assert.equal(result.hands.p1.length, 10);
  assert.equal(result.hands.p2.length, 10);
  assert.equal(result.rows.length, 4);
  assert.equal(result.remainingDeck.length, 80);
  assert.deepEqual(result.hands.p1.map((card) => card.value), [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
});

test('createRound shuffles and deals a round', () => {
  const round = createRound(['p1', 'p2'], fixedRng);
  assert.equal(round.rows.length, 4);
  assert.equal(round.hands.p1.length, 10);
  assert.equal(round.hands.p2.length, 10);
});

test('applyCardToRows places after the closest lower row end', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  const result = applyCardToRows(rows, { value: 52, bulls: 1 }, 'p1');
  assert.equal(result.needsRowChoice, false);
  assert.deepEqual(result.rows[2].map((card) => card.value), [50, 52]);
  assert.equal(result.penaltyCards.length, 0);
});

test('applyCardToRows takes five cards when played card is sixth', () => {
  const rows = [
    [{ value: 10, bulls: 3 }, { value: 11, bulls: 5 }, { value: 12, bulls: 1 }, { value: 13, bulls: 1 }, { value: 14, bulls: 1 }],
    [{ value: 30, bulls: 3 }],
    [{ value: 50, bulls: 3 }],
    [{ value: 70, bulls: 3 }]
  ];
  const result = applyCardToRows(rows, { value: 15, bulls: 2 }, 'p1');
  assert.equal(result.needsRowChoice, false);
  assert.deepEqual(result.rows[0].map((card) => card.value), [15]);
  assert.deepEqual(result.penaltyCards.map((card) => card.value), [10, 11, 12, 13, 14]);
  assert.equal(getRowPenalty(result.penaltyCards), 11);
});

test('applyCardToRows requests row choice when card is lower than all rows', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  const result = applyCardToRows(rows, { value: 4, bulls: 1 }, 'p1');
  assert.equal(result.needsRowChoice, true);
  assert.equal(result.pending.playerId, 'p1');
  assert.equal(result.pending.card.value, 4);
});

test('resolvePlayedCards resolves selected cards in ascending order', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  const result = resolvePlayedCards(rows, [
    { playerId: 'p2', card: { value: 32, bulls: 1 } },
    { playerId: 'p1', card: { value: 12, bulls: 1 } }
  ]);
  assert.equal(result.pending, null);
  assert.deepEqual(result.rows[0].map((card) => card.value), [10, 12]);
  assert.deepEqual(result.rows[1].map((card) => card.value), [30, 32]);
  assert.deepEqual(result.logs.map((entry) => entry.card.value), [12, 32]);
});
```

- [x] **Step 2: Run tests to verify failures**

Run:

```powershell
npm test
```

Expected: failures for missing exports such as `createDeck` and `applyCardToRows`.

- [x] **Step 3: Implement full pure rules**

Replace `src/game/rules.js`:

```js
export const CARD_MIN = 1;
export const CARD_MAX = 104;
export const HAND_SIZE = 10;
export const ROW_COUNT = 4;
export const ROW_LIMIT = 5;
export const SCORE_LIMIT = 66;

export function getBullCount(value) {
  if (value === 55) return 7;
  if (value % 11 === 0) return 5;
  if (value % 10 === 0) return 3;
  if (value % 5 === 0) return 2;
  return 1;
}

export function createDeck() {
  return Array.from({ length: CARD_MAX }, (_, index) => {
    const value = index + CARD_MIN;
    return { value, bulls: getBullCount(value) };
  });
}

export function shuffleDeck(deck, rng = Math.random) {
  const shuffled = deck.map((card) => ({ ...card }));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function sortHand(hand) {
  return [...hand].sort((a, b) => a.value - b.value);
}

export function dealHands(deck, playerIds) {
  const hands = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
  let cursor = 0;

  for (let cardIndex = 0; cardIndex < HAND_SIZE; cardIndex += 1) {
    for (const playerId of playerIds) {
      hands[playerId].push(deck[cursor]);
      cursor += 1;
    }
  }

  for (const playerId of playerIds) {
    hands[playerId] = sortHand(hands[playerId]);
  }

  const rows = [];
  for (let rowIndex = 0; rowIndex < ROW_COUNT; rowIndex += 1) {
    rows.push([deck[cursor]]);
    cursor += 1;
  }

  return {
    hands,
    rows,
    remainingDeck: deck.slice(cursor)
  };
}

export function createRound(playerIds, rng = Math.random) {
  return dealHands(shuffleDeck(createDeck(), rng), playerIds);
}

export function getRowPenalty(row) {
  return row.reduce((total, card) => total + card.bulls, 0);
}

export function cloneRows(rows) {
  return rows.map((row) => row.map((card) => ({ ...card })));
}

export function findTargetRowIndex(rows, card) {
  let bestIndex = -1;
  let bestValue = -Infinity;

  rows.forEach((row, rowIndex) => {
    const lastCard = row[row.length - 1];
    if (lastCard.value < card.value && lastCard.value > bestValue) {
      bestIndex = rowIndex;
      bestValue = lastCard.value;
    }
  });

  return bestIndex;
}

export function takeRowForCard(rows, rowIndex, card) {
  const nextRows = cloneRows(rows);
  const penaltyCards = nextRows[rowIndex];
  nextRows[rowIndex] = [{ ...card }];
  return { rows: nextRows, penaltyCards };
}

export function applyCardToRows(rows, card, playerId) {
  const targetRowIndex = findTargetRowIndex(rows, card);

  if (targetRowIndex === -1) {
    return {
      rows: cloneRows(rows),
      penaltyCards: [],
      needsRowChoice: true,
      pending: { playerId, card: { ...card } },
      log: { type: 'needs-row-choice', playerId, card: { ...card } }
    };
  }

  const nextRows = cloneRows(rows);
  const targetRow = nextRows[targetRowIndex];

  if (targetRow.length >= ROW_LIMIT) {
    const penaltyCards = targetRow.map((rowCard) => ({ ...rowCard }));
    nextRows[targetRowIndex] = [{ ...card }];
    return {
      rows: nextRows,
      penaltyCards,
      needsRowChoice: false,
      pending: null,
      log: { type: 'take-row', playerId, card: { ...card }, rowIndex: targetRowIndex, penaltyCards }
    };
  }

  targetRow.push({ ...card });
  return {
    rows: nextRows,
    penaltyCards: [],
    needsRowChoice: false,
    pending: null,
    log: { type: 'place-card', playerId, card: { ...card }, rowIndex: targetRowIndex }
  };
}

export function resolvePlayedCards(rows, playedCards, startIndex = 0, logs = [], penaltyCardsByPlayer = {}) {
  const sorted = [...playedCards].sort((a, b) => a.card.value - b.card.value);
  let nextRows = cloneRows(rows);
  const nextPenaltyCardsByPlayer = { ...penaltyCardsByPlayer };
  const nextLogs = [...logs];

  for (let index = startIndex; index < sorted.length; index += 1) {
    const played = sorted[index];
    const result = applyCardToRows(nextRows, played.card, played.playerId);

    if (result.needsRowChoice) {
      return {
        rows: nextRows,
        pending: {
          ...result.pending,
          playedCards: sorted,
          nextIndex: index,
          logs: nextLogs,
          penaltyCardsByPlayer: nextPenaltyCardsByPlayer
        },
        logs: nextLogs,
        penaltyCardsByPlayer: nextPenaltyCardsByPlayer
      };
    }

    nextRows = result.rows;
    if (result.penaltyCards.length > 0) {
      nextPenaltyCardsByPlayer[played.playerId] = [
        ...(nextPenaltyCardsByPlayer[played.playerId] ?? []),
        ...result.penaltyCards
      ];
    }
    nextLogs.push(result.log);
  }

  return {
    rows: nextRows,
    pending: null,
    logs: nextLogs,
    penaltyCardsByPlayer: nextPenaltyCardsByPlayer
  };
}

export function continueAfterRowChoice(pending, rows, rowIndex) {
  const takeResult = takeRowForCard(rows, rowIndex, pending.card);
  const penaltyCardsByPlayer = {
    ...pending.penaltyCardsByPlayer,
    [pending.playerId]: [
      ...(pending.penaltyCardsByPlayer[pending.playerId] ?? []),
      ...takeResult.penaltyCards
    ]
  };
  const logs = [
    ...pending.logs,
    { type: 'choose-row', playerId: pending.playerId, card: pending.card, rowIndex, penaltyCards: takeResult.penaltyCards }
  ];

  return resolvePlayedCards(
    takeResult.rows,
    pending.playedCards,
    pending.nextIndex + 1,
    logs,
    penaltyCardsByPlayer
  );
}
```

- [x] **Step 4: Verify pure rule tests pass**

Run:

```powershell
npm test
```

Expected: all `rules.test.js` tests pass.

---

### Task 3: Implement Room Manager

**Files:**
- Create: `src/game/rooms.js`
- Create: `src/game/rooms.test.js`

- [x] **Step 1: Add room manager tests**

Create `src/game/rooms.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './rooms.js';

test('creates room with host and short code', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  const room = manager.createRoom('socket-1', 'Pim');
  assert.equal(room.code, '4821');
  assert.equal(room.hostId, 'socket-1');
  assert.equal(room.players.length, 1);
});

test('joins room and rejects duplicate names', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  assert.throws(() => manager.joinRoom('4821', 'socket-3', 'Friend'), /Name already used/);
});

test('blocks starting with fewer than two players', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  assert.throws(() => manager.startGame('4821', 'socket-1'), /Need 2-4 players/);
});

test('starts game and sends private hands only to matching player', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const pimView = manager.getPrivateView('4821', 'socket-1');
  const friendView = manager.getPrivateView('4821', 'socket-2');
  assert.equal(pimView.hand.length, 10);
  assert.equal(friendView.hand.length, 10);
  assert.notDeepEqual(pimView.hand, friendView.hand);
  assert.equal(Object.hasOwn(pimView, 'hands'), false);
});

test('chooses cards, resolves turn, and updates hands', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('4821-host', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', '4821-host');
  const room = manager.requireRoom('4821');
  room.rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands = {
    '4821-host': [{ value: 12, bulls: 1 }],
    'socket-2': [{ value: 32, bulls: 1 }]
  };
  manager.chooseCard('4821', '4821-host', 12);
  manager.chooseCard('4821', 'socket-2', 32);
  assert.equal(manager.getPrivateView('4821', '4821-host').hand.length, 0);
  assert.equal(manager.getPublicView('4821').selectedCount, 0);
});
```

- [x] **Step 2: Run tests to verify failures**

Run:

```powershell
npm test
```

Expected: failure because `src/game/rooms.js` does not exist.

- [x] **Step 3: Implement room manager**

Create `src/game/rooms.js`:

```js
import {
  SCORE_LIMIT,
  continueAfterRowChoice,
  createRound,
  getRowPenalty,
  resolvePlayedCards,
  sortHand
} from './rules.js';

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

export class RoomManager {
  constructor({ codeGenerator = createRoomCode, rng = Math.random } = {}) {
    this.rooms = new Map();
    this.codeGenerator = codeGenerator;
    this.rng = rng;
  }

  createRoom(socketId, name) {
    const cleanName = validateName(name);
    let code = this.codeGenerator();
    while (this.rooms.has(code)) code = this.codeGenerator();

    const room = {
      code,
      hostId: socketId,
      phase: 'lobby',
      players: [{ id: socketId, name: cleanName, score: 0, connected: true }],
      hands: {},
      rows: [],
      selectedCards: {},
      roundPenaltyCards: {},
      turn: 0,
      pending: null,
      lastLogs: []
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code, socketId, name) {
    const room = this.requireRoom(code);
    const cleanName = validateName(name);
    if (room.phase !== 'lobby') throw new Error('Game already started');
    if (room.players.length >= MAX_PLAYERS) throw new Error('Room is full');
    if (room.players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('Name already used');
    }
    room.players.push({ id: socketId, name: cleanName, score: 0, connected: true });
    return room;
  }

  startGame(code, socketId) {
    const room = this.requireRoom(code);
    if (room.hostId !== socketId) throw new Error('Only the host can start');
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      throw new Error('Need 2-4 players');
    }
    this.startNewRound(room);
    return room;
  }

  startNewRound(room) {
    const playerIds = room.players.map((player) => player.id);
    const round = createRound(playerIds, this.rng);
    room.phase = 'choosing';
    room.hands = round.hands;
    room.rows = round.rows;
    room.selectedCards = {};
    room.roundPenaltyCards = Object.fromEntries(playerIds.map((playerId) => [playerId, []]));
    room.turn = 1;
    room.pending = null;
    room.lastLogs = [{ type: 'round-start' }];
  }

  chooseCard(code, socketId, cardValue) {
    const room = this.requireRoom(code);
    if (room.phase !== 'choosing') throw new Error('Not choosing now');
    if (room.selectedCards[socketId]) throw new Error('Card already selected');

    const hand = room.hands[socketId] ?? [];
    const cardIndex = hand.findIndex((card) => card.value === Number(cardValue));
    if (cardIndex === -1) throw new Error('Card is not in your hand');

    const [card] = hand.splice(cardIndex, 1);
    room.hands[socketId] = sortHand(hand);
    room.selectedCards[socketId] = card;

    if (Object.keys(room.selectedCards).length === room.players.length) {
      this.resolveTurn(room);
    }

    return room;
  }

  resolveTurn(room) {
    room.phase = 'resolving';
    const playedCards = Object.entries(room.selectedCards).map(([playerId, card]) => ({ playerId, card }));
    const result = resolvePlayedCards(room.rows, playedCards);
    this.applyResolutionResult(room, result);
  }

  chooseRow(code, socketId, rowIndex) {
    const room = this.requireRoom(code);
    if (room.phase !== 'choose-row') throw new Error('No row choice needed');
    if (room.pending.playerId !== socketId) throw new Error('This row choice belongs to another player');
    const numericRowIndex = Number(rowIndex);
    if (!Number.isInteger(numericRowIndex) || numericRowIndex < 0 || numericRowIndex >= room.rows.length) {
      throw new Error('Invalid row');
    }

    const result = continueAfterRowChoice(room.pending, room.rows, numericRowIndex);
    this.applyResolutionResult(room, result);
    return room;
  }

  applyResolutionResult(room, result) {
    room.rows = result.rows;
    room.lastLogs = result.logs.slice(-8);

    if (result.pending) {
      room.pending = result.pending;
      room.phase = 'choose-row';
      return;
    }

    for (const [playerId, cards] of Object.entries(result.penaltyCardsByPlayer)) {
      room.roundPenaltyCards[playerId] = [...(room.roundPenaltyCards[playerId] ?? []), ...cards];
    }

    room.pending = null;
    room.selectedCards = {};

    const roundFinished = Object.values(room.hands).every((hand) => hand.length === 0);
    if (roundFinished) {
      this.finishRound(room);
      return;
    }

    room.turn += 1;
    room.phase = 'choosing';
  }

  finishRound(room) {
    for (const player of room.players) {
      const roundPenalty = getRowPenalty(room.roundPenaltyCards[player.id] ?? []);
      player.score += roundPenalty;
    }
    room.phase = room.players.some((player) => player.score >= SCORE_LIMIT) ? 'game-over' : 'round-over';
  }

  nextRound(code, socketId) {
    const room = this.requireRoom(code);
    if (room.hostId !== socketId) throw new Error('Only the host can continue');
    if (room.phase !== 'round-over') throw new Error('Round is not over');
    this.startNewRound(room);
    return room;
  }

  getPublicView(code) {
    const room = this.requireRoom(code);
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        connected: player.connected,
        isHost: player.id === room.hostId
      })),
      rows: room.rows,
      selectedCount: Object.keys(room.selectedCards).length,
      playerCount: room.players.length,
      turn: room.turn,
      pendingPlayerId: room.pending?.playerId ?? null,
      lastLogs: room.lastLogs
    };
  }

  getPrivateView(code, socketId) {
    return {
      ...this.getPublicView(code),
      myId: socketId,
      hand: roomHand(this.requireRoom(code), socketId),
      mySelected: Boolean(this.requireRoom(code).selectedCards[socketId])
    };
  }

  disconnect(socketId) {
    for (const room of this.rooms.values()) {
      const player = room.players.find((candidate) => candidate.id === socketId);
      if (player) player.connected = false;
    }
  }

  requireRoom(code) {
    const room = this.rooms.get(String(code).trim());
    if (!room) throw new Error('Room not found');
    return room;
  }
}

function roomHand(room, socketId) {
  return room.hands[socketId] ? [...room.hands[socketId]] : [];
}

function validateName(name) {
  const cleanName = String(name ?? '').trim().slice(0, 18);
  if (!cleanName) throw new Error('Name is required');
  return cleanName;
}

function createRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
```

- [x] **Step 4: Verify room tests pass**

Run:

```powershell
npm test
```

Expected: all rules and room tests pass.

---

### Task 4: Add Server and Socket Events

**Files:**
- Create: `src/server.js`
- Create: `public/index.html`

- [x] **Step 1: Add static app shell**

Create `public/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>6 Nimmt Local</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main id="app" class="app"></main>
    <script src="/socket.io/socket.io.js"></script>
    <script type="module" src="/client.js"></script>
  </body>
</html>
```

- [x] **Step 2: Add Socket.IO server**

Create `src/server.js`:

```js
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
const rooms = new RoomManager();

app.use(express.static(publicDir));

io.on('connection', (socket) => {
  let joinedRoomCode = null;

  socket.on('create-room', ({ name }, reply) => {
    handle(reply, () => {
      const room = rooms.createRoom(socket.id, name);
      joinedRoomCode = room.code;
      socket.join(room.code);
      emitRoom(room.code);
      return rooms.getPrivateView(room.code, socket.id);
    });
  });

  socket.on('join-room', ({ code, name }, reply) => {
    handle(reply, () => {
      const room = rooms.joinRoom(code, socket.id, name);
      joinedRoomCode = room.code;
      socket.join(room.code);
      emitRoom(room.code);
      return rooms.getPrivateView(room.code, socket.id);
    });
  });

  socket.on('start-game', (reply) => {
    handle(reply, () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.startGame(code, socket.id);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('choose-card', ({ value }, reply) => {
    handle(reply, () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.chooseCard(code, socket.id, value);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('choose-row', ({ rowIndex }, reply) => {
    handle(reply, () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.chooseRow(code, socket.id, rowIndex);
      emitRoom(code);
      return rooms.getPrivateView(code, socket.id);
    });
  });

  socket.on('next-round', (reply) => {
    handle(reply, () => {
      const code = requireJoinedRoom(joinedRoomCode);
      rooms.nextRound(code, socket.id);
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
  try {
    reply({ ok: true, state: action() });
  } catch (error) {
    reply({ ok: false, error: error.message });
  }
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
```

- [x] **Step 3: Verify server starts**

Run:

```powershell
npm start
```

Expected: terminal prints `http://localhost:3000` and at least one local network URL. Stop it with `Ctrl+C`.

---

### Task 5: Build Frontend Rendering and Card Art

**Files:**
- Create: `public/styles.css`
- Create: `public/client.js`

- [x] **Step 1: Add responsive styles and card art**

Create `public/styles.css`:

```css
:root {
  --ink: #1d1715;
  --muted: #6d625c;
  --table: #2f7a5d;
  --felt-dark: #215440;
  --paper: #fffdf8;
  --panel: #f5efe6;
  --line: #d8cabe;
  --danger: #ba2f2f;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: #ead9c4;
  color: var(--ink);
}
button, input {
  font: inherit;
}
button {
  border: 0;
  border-radius: 7px;
  background: #1f6b4d;
  color: white;
  padding: 10px 14px;
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 10px 12px;
}
.app {
  min-height: 100vh;
  padding: 18px;
}
.home {
  max-width: 820px;
  margin: 40px auto;
  display: grid;
  gap: 18px;
}
.home-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
}
.form {
  display: grid;
  gap: 10px;
}
.error {
  color: var(--danger);
  min-height: 24px;
}
.game {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  max-width: 1280px;
  margin: 0 auto;
}
.table {
  background: var(--table);
  border: 8px solid var(--felt-dark);
  border-radius: 8px;
  padding: 14px;
  min-height: calc(100vh - 36px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
}
.topbar, .hand, .row, .side-panel {
  background: rgba(255, 253, 248, 0.92);
  border-radius: 8px;
  border: 1px solid rgba(31, 22, 16, 0.16);
}
.topbar {
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.rows {
  display: grid;
  gap: 10px;
  align-content: center;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-height: 132px;
}
.row-label {
  min-width: 34px;
  color: var(--muted);
  font-weight: 700;
}
.cards {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.hand {
  padding: 10px;
}
.hand-title {
  margin: 0 0 8px;
  color: var(--muted);
  font-weight: 700;
}
.side {
  display: grid;
  gap: 12px;
  align-content: start;
}
.side-panel {
  padding: 12px;
}
.side-panel h2, .side-panel h3 {
  margin: 0 0 10px;
}
.player {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.log {
  font-size: 14px;
  color: var(--muted);
}
.nimmt-card {
  --accent: #6e2d83;
  --card-bg: #ffffff;
  --num: #ffffff;
  position: relative;
  width: 76px;
  aspect-ratio: 0.67;
  border: 2px solid #d7d1ca;
  border-radius: 9px;
  background: var(--card-bg);
  box-shadow: 0 4px 9px rgba(32, 20, 12, 0.2);
  overflow: hidden;
  flex: 0 0 auto;
}
.nimmt-card.selectable {
  transform: translateY(0);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.nimmt-card.selectable:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 14px rgba(32, 20, 12, 0.28);
}
.nimmt-card.blue { --accent: #235c9d; --card-bg: #b9e1e6; --num: #f4dd38; }
.nimmt-card.purple { --accent: #6e2d83; --card-bg: #ffffff; --num: #ffffff; }
.nimmt-card.gold { --accent: #cf1f1f; --card-bg: #f4b833; --num: #bce7f3; }
.nimmt-card.red { --accent: #d52027; --card-bg: #e52a2d; --num: #ffc43b; }
.nimmt-card.royal { --accent: #d52027; --card-bg: #4c277d; --num: #ffc43b; }
.corner {
  position: absolute;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-size: 14px;
  line-height: 1;
  color: #161311;
  z-index: 3;
}
.corner.tl { top: 6px; left: 6px; }
.corner.tr { top: 6px; right: 6px; }
.corner.bl { bottom: 6px; left: 6px; transform: rotate(180deg); }
.corner.br { bottom: 6px; right: 6px; transform: rotate(180deg); }
.pips {
  position: absolute;
  left: 50%;
  top: 7px;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 1px;
  z-index: 3;
}
.pips.bottom {
  top: auto;
  bottom: 7px;
  transform: translateX(-50%) rotate(180deg);
}
.bull {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 76%;
  height: 48%;
  transform: translate(-50%, -50%);
  background: var(--accent);
  clip-path: polygon(10% 34%, 0 4%, 31% 25%, 43% 9%, 57% 9%, 69% 25%, 100% 4%, 90% 34%, 78% 40%, 72% 87%, 50% 100%, 28% 87%, 22% 40%);
}
.big-number {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-size: 39px;
  color: var(--num);
  -webkit-text-stroke: 3px #181411;
  text-shadow: 2px 2px 0 #fff;
  z-index: 2;
}
.row-choice {
  outline: 4px solid #ffd95a;
}
@media (max-width: 820px) {
  .app { padding: 10px; }
  .home-grid, .game { grid-template-columns: 1fr; }
  .table { min-height: auto; }
  .nimmt-card { width: 62px; }
  .row { min-height: 112px; }
}
```

- [x] **Step 2: Add browser client**

Create `public/client.js`:

```js
const socket = io();
const app = document.querySelector('#app');
let state = null;
let error = '';

renderHome();

socket.on('state', (nextState) => {
  state = nextState;
  error = '';
  render();
});

function emit(eventName, payload = {}) {
  socket.emit(eventName, payload, (response) => {
    if (!response.ok) {
      error = response.error;
      render();
      return;
    }
    state = response.state;
    error = '';
    render();
  });
}

function render() {
  if (!state) {
    renderHome();
    return;
  }
  if (state.phase === 'lobby') renderLobby();
  else renderGame();
}

function renderHome() {
  app.innerHTML = `
    <section class="home">
      <div>
        <h1>6 Nimmt Local</h1>
        <p>Play classic 6 nimmt! with 2-4 friends on the same Wi-Fi.</p>
      </div>
      <div class="home-grid">
        <form id="create-form" class="panel form">
          <h2>Create Room</h2>
          <input name="name" maxlength="18" placeholder="Your name" required>
          <button>Create</button>
        </form>
        <form id="join-form" class="panel form">
          <h2>Join Room</h2>
          <input name="code" inputmode="numeric" maxlength="4" placeholder="Room code" required>
          <input name="name" maxlength="18" placeholder="Your name" required>
          <button>Join</button>
        </form>
      </div>
      <div class="error">${escapeHtml(error)}</div>
    </section>
  `;
  document.querySelector('#create-form').addEventListener('submit', (event) => {
    event.preventDefault();
    emit('create-room', { name: new FormData(event.currentTarget).get('name') });
  });
  document.querySelector('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    emit('join-room', { code: form.get('code'), name: form.get('name') });
  });
}

function renderLobby() {
  const isHost = state.myId === state.hostId;
  app.innerHTML = `
    <section class="home">
      <div class="panel">
        <h1>Room ${escapeHtml(state.code)}</h1>
        <p>Friends on the same Wi-Fi can join with this code.</p>
      </div>
      <div class="panel">
        <h2>Players</h2>
        ${state.players.map(renderPlayer).join('')}
      </div>
      <button id="start" ${isHost && state.players.length >= 2 ? '' : 'disabled'}>Start Game</button>
      <div class="error">${escapeHtml(error)}</div>
    </section>
  `;
  document.querySelector('#start').addEventListener('click', () => emit('start-game'));
}

function renderGame() {
  const choosing = state.phase === 'choosing' && !state.mySelected;
  const waiting = state.phase === 'choosing' && state.mySelected;
  const choosingRow = state.phase === 'choose-row' && state.pendingPlayerId === state.myId;
  app.innerHTML = `
    <section class="game">
      <div class="table">
        <div class="topbar">
          <strong>Room ${escapeHtml(state.code)}</strong>
          <span>${phaseText()}</span>
          <span>Turn ${state.turn || 0}/10</span>
        </div>
        <div class="rows">
          ${state.rows.map((row, index) => renderRow(row, index, choosingRow)).join('')}
        </div>
        <div class="hand">
          <p class="hand-title">${waiting ? 'Card chosen. Waiting for friends...' : 'Your hand'}</p>
          <div class="cards">
            ${state.hand.map((card) => renderCard(card, choosing)).join('')}
          </div>
        </div>
      </div>
      <aside class="side">
        <div class="side-panel">
          <h2>Players</h2>
          ${state.players.map(renderPlayer).join('')}
        </div>
        <div class="side-panel">
          <h3>Status</h3>
          <p>${state.selectedCount} / ${state.playerCount} cards chosen</p>
          ${state.phase === 'round-over' && state.myId === state.hostId ? '<button id="next-round">Next Round</button>' : ''}
        </div>
        <div class="side-panel">
          <h3>Log</h3>
          ${state.lastLogs.map(renderLog).join('') || '<p class="log">No moves yet.</p>'}
        </div>
        <div class="error">${escapeHtml(error)}</div>
      </aside>
    </section>
  `;

  document.querySelectorAll('[data-card]').forEach((cardButton) => {
    cardButton.addEventListener('click', () => emit('choose-card', { value: cardButton.dataset.card }));
  });
  document.querySelectorAll('[data-row]').forEach((rowButton) => {
    rowButton.addEventListener('click', () => emit('choose-row', { rowIndex: rowButton.dataset.row }));
  });
  document.querySelector('#next-round')?.addEventListener('click', () => emit('next-round'));
}

function renderRow(row, index, choosingRow) {
  return `
    <div class="row ${choosingRow ? 'row-choice' : ''}" ${choosingRow ? `data-row="${index}"` : ''}>
      <div class="row-label">R${index + 1}</div>
      <div class="cards">${row.map((card) => renderCard(card, false)).join('')}</div>
    </div>
  `;
}

function renderCard(card, selectable) {
  const bulls = '♞'.repeat(card.bulls);
  return `
    <button type="button" class="nimmt-card ${cardClass(card)} ${selectable ? 'selectable' : ''}" ${selectable ? `data-card="${card.value}"` : 'tabindex="-1" aria-disabled="true"'}>
      <span class="corner tl">${card.value}</span>
      <span class="corner tr">${card.value}</span>
      <span class="pips">${bulls}</span>
      <span class="bull"></span>
      <span class="big-number">${card.value}</span>
      <span class="pips bottom">${bulls}</span>
      <span class="corner bl">${card.value}</span>
      <span class="corner br">${card.value}</span>
    </button>
  `;
}

function cardClass(card) {
  if (card.value === 55) return 'royal';
  if (card.bulls === 5) return 'red';
  if (card.bulls === 3) return 'gold';
  if (card.bulls === 2) return 'blue';
  return 'purple';
}

function renderPlayer(player) {
  return `
    <div class="player">
      <span>${escapeHtml(player.name)}${player.isHost ? ' host' : ''}${player.id === state?.myId ? ' you' : ''}</span>
      <strong>${player.score}</strong>
    </div>
  `;
}

function renderLog(log) {
  if (log.type === 'round-start') return '<p class="log">New round started.</p>';
  const card = log.card?.value ?? '?';
  if (log.type === 'place-card') return `<p class="log">${playerName(log.playerId)} placed ${card} on row ${log.rowIndex + 1}.</p>`;
  if (log.type === 'take-row') return `<p class="log">${playerName(log.playerId)} played ${card} and took row ${log.rowIndex + 1}.</p>`;
  if (log.type === 'choose-row') return `<p class="log">${playerName(log.playerId)} chose row ${log.rowIndex + 1} for ${card}.</p>`;
  return '<p class="log">Move resolved.</p>';
}

function playerName(playerId) {
  return state.players.find((player) => player.id === playerId)?.name ?? 'Player';
}

function phaseText() {
  if (state.phase === 'choosing') return state.mySelected ? 'Waiting for friends' : 'Pick one card';
  if (state.phase === 'choose-row') return state.pendingPlayerId === state.myId ? 'Choose a row to take' : 'Waiting for row choice';
  if (state.phase === 'round-over') return 'Round over';
  if (state.phase === 'game-over') return 'Game over';
  return 'Resolving';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}
```

- [x] **Step 3: Run tests after frontend files**

Run:

```powershell
npm test
```

Expected: all server-side tests still pass.

---

### Task 6: Manual Multiplayer Verification

**Files:**
- No planned file edits.

- [x] **Step 1: Start the app**

Run:

```powershell
npm start
```

Expected: server prints a localhost URL and a local-network URL.

- [x] **Step 2: Verify local browser flow**

Open `http://localhost:3000` in one browser tab:

- Create a room with name `Pim`.
- Confirm a 4-digit room code appears.
- Confirm the Start button is disabled with one player.

- [x] **Step 3: Verify two-player flow**

Open a second browser tab or another browser profile:

- Join the room code as `Friend`.
- Confirm both screens show two players.
- Start the game from the host tab.
- Confirm each tab shows a different private hand.

- [x] **Step 4: Verify turn flow**

In both tabs:

- Choose one card.
- Confirm the table updates after both players choose.
- Confirm each hand has 9 cards.
- Continue until at least one row take occurs.

- [x] **Step 5: Verify same-Wi-Fi URL**

From another device on the same Wi-Fi:

- Open the local network URL printed by the server, such as `http://192.168.x.x:3000`.
- Join an open room with the room code.
- Confirm the device receives its own hand and synchronized rows.

---

## Self-Review Notes

- Spec coverage: room codes, 2-4 players, private hands, classic rules, split panel UI, card art, same-Wi-Fi hosting, and no database are covered by Tasks 1-6.
- TDD coverage: rules and room manager are tested before implementation.
- Manual coverage: browser and same-Wi-Fi flows are verified in Task 6.
- Known v1 limit: refresh recovery intentionally returns players to the home/join flow, matching the approved spec.
