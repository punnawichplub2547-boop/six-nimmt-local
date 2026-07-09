import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from './rooms.js';

test('creates room with host and short code', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  const room = manager.createRoom('socket-1', 'Pim');
  assert.equal(room.code, '4821');
  assert.equal(room.hostId, 'socket-1');
  assert.equal(room.players.length, 1);
  assert.equal(room.startingHp, 66);
  assert.equal(room.players[0].hp, 66);
  assert.equal(Object.hasOwn(room, 'hands'), false);
});

test('host can start a game with custom starting hp', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');

  const view = manager.startGame('4821', 'socket-1', { startingHp: 40 });

  assert.equal(view.startingHp, 40);
  assert.deepEqual(view.players.map((player) => player.hp), [40, 40]);
});

test('validates custom starting hp', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');

  assert.throws(() => manager.startGame('4821', 'socket-1', { startingHp: 0 }), /HP must be between/);
  assert.throws(() => manager.startGame('4821', 'socket-1', { startingHp: 501 }), /HP must be between/);
});

test('joins room and rejects duplicate names', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  assert.throws(() => manager.joinRoom('4821', 'socket-3', 'Friend'), /Name already used/);
});

test('rejects duplicate socket id joins', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  assert.throws(() => manager.joinRoom('4821', 'socket-2', 'Other'), /Player already joined/);
});

test('blocks joining a full room', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend 1');
  manager.joinRoom('4821', 'socket-3', 'Friend 2');
  manager.joinRoom('4821', 'socket-4', 'Friend 3');
  assert.throws(() => manager.joinRoom('4821', 'socket-5', 'Friend 4'), /Room is full/);
});

test('blocks starting with fewer than two players', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  assert.throws(() => manager.startGame('4821', 'socket-1'), /Need 2-4 players/);
});

test('blocks non-host from starting a game', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821' });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  assert.throws(() => manager.startGame('4821', 'socket-2'), /Only the host can start/);
});

test('blocks starting a game after it has already started', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  assert.throws(() => manager.startGame('4821', 'socket-1'), /Game already started/);
});

test('allows a disconnected player to reclaim their active game seat by name', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const originalHand = manager.getPrivateView('4821', 'socket-2').hand;

  manager.disconnect('socket-2');
  manager.joinRoom('4821', 'socket-3', 'Friend');

  const view = manager.getPrivateView('4821', 'socket-3');
  assert.deepEqual(view.hand, originalHand);
  assert.equal(view.players.some((player) => player.id === 'socket-2'), false);
  assert.equal(view.players.find((player) => player.id === 'socket-3').connected, true);
});

test('reclaimed seat keeps selected card state and can finish the turn', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const room = manager.requireRoom('4821');
  room.rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands = {
    'socket-1': [{ value: 12, bulls: 1 }],
    'socket-2': [{ value: 32, bulls: 1 }]
  };

  manager.chooseCard('4821', 'socket-2', 32);
  manager.disconnect('socket-2');
  manager.joinRoom('4821', 'socket-3', 'Friend');

  assert.equal(manager.getPrivateView('4821', 'socket-3').mySelected, true);
  manager.chooseCard('4821', 'socket-1', 12);
  manager.resolveCards('4821', 'socket-1');
  assert.equal(manager.getPublicView('4821').phase, 'round-over');
});

test('starts game and sends private hands only to matching player', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  const startedView = manager.startGame('4821', 'socket-1');
  assert.equal(Object.hasOwn(startedView, 'hands'), false);
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
  assert.equal(manager.getPublicView('4821').phase, 'reveal');
  manager.resolveCards('4821', '4821-host');
  assert.equal(manager.getPrivateView('4821', '4821-host').hand.length, 0);
  assert.equal(manager.getPublicView('4821').selectedCount, 0);
  assert.equal(manager.getPublicView('4821').phase, 'round-over');
});

test('reveals selected cards in placement order before resolving', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const room = manager.requireRoom('4821');
  room.hands = {
    'socket-1': [{ value: 80, bulls: 3 }],
    'socket-2': [{ value: 20, bulls: 3 }]
  };

  manager.chooseCard('4821', 'socket-1', 80);
  manager.chooseCard('4821', 'socket-2', 20);
  const view = manager.getPublicView('4821');

  assert.equal(view.phase, 'reveal');
  assert.deepEqual(view.revealedCards.map((played) => [played.playerId, played.card.value]), [
    ['socket-2', 20],
    ['socket-1', 80]
  ]);
});

test('only host can resolve revealed cards', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const room = manager.requireRoom('4821');
  room.hands = {
    'socket-1': [{ value: 80, bulls: 3 }],
    'socket-2': [{ value: 20, bulls: 3 }]
  };

  manager.chooseCard('4821', 'socket-1', 80);
  manager.chooseCard('4821', 'socket-2', 20);

  assert.throws(() => manager.resolveCards('4821', 'socket-2'), /Only the host can resolve/);
});

test('taking a row immediately reduces hp', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1', { startingHp: 20 });
  const room = manager.requireRoom('4821');
  room.rows = [[
    { value: 10, bulls: 3 },
    { value: 11, bulls: 5 },
    { value: 12, bulls: 1 },
    { value: 13, bulls: 1 },
    { value: 14, bulls: 1 }
  ], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands = {
    'socket-1': [{ value: 15, bulls: 2 }],
    'socket-2': [{ value: 80, bulls: 3 }]
  };

  manager.chooseCard('4821', 'socket-1', 15);
  manager.chooseCard('4821', 'socket-2', 80);
  manager.resolveCards('4821', 'socket-1');

  assert.equal(manager.getPublicView('4821').players.find((player) => player.id === 'socket-1').hp, 9);
});

test('game ends when hp reaches zero', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1', { startingHp: 5 });
  const room = manager.requireRoom('4821');
  room.rows = [[
    { value: 10, bulls: 3 },
    { value: 11, bulls: 5 },
    { value: 12, bulls: 1 },
    { value: 13, bulls: 1 },
    { value: 14, bulls: 1 }
  ], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands = {
    'socket-1': [{ value: 15, bulls: 2 }],
    'socket-2': [{ value: 80, bulls: 3 }]
  };

  manager.chooseCard('4821', 'socket-1', 15);
  manager.chooseCard('4821', 'socket-2', 80);
  manager.resolveCards('4821', 'socket-1');

  assert.equal(manager.getPublicView('4821').phase, 'game-over');
});

test('command methods return public views without private hands', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  const createdView = manager.createRoom('socket-1', 'Pim');
  const joinedView = manager.joinRoom('4821', 'socket-2', 'Friend');
  const startedView = manager.startGame('4821', 'socket-1');
  const chosenCardValue = manager.getPrivateView('4821', 'socket-1').hand[0].value;
  const chosenView = manager.chooseCard('4821', 'socket-1', chosenCardValue);

  for (const view of [createdView, joinedView, startedView, chosenView]) {
    assert.equal(Object.hasOwn(view, 'hands'), false);
    assert.equal(Object.hasOwn(view, 'roundPenaltyCards'), false);
  }
});

test('public view exposes pending player and card for row choice', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const room = manager.requireRoom('4821');
  room.rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands = {
    'socket-1': [{ value: 5, bulls: 2 }],
    'socket-2': [{ value: 32, bulls: 1 }]
  };

  manager.chooseCard('4821', 'socket-1', 5);
  manager.chooseCard('4821', 'socket-2', 32);
  manager.resolveCards('4821', 'socket-1');
  const view = manager.getPublicView('4821');

  assert.equal(view.phase, 'choose-row');
  assert.equal(view.pendingPlayerId, 'socket-1');
  assert.deepEqual(view.pendingCard, { value: 5, bulls: 2 });
  view.pendingCard.value = 99;
  assert.equal(manager.requireRoom('4821').pending.card.value, 5);
});

test('views clone nested cards and logs', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const room = manager.requireRoom('4821');
  room.rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands['socket-1'] = [{ value: 12, bulls: 1 }];
  room.lastLogs = [{
    type: 'take-row',
    playerId: 'socket-1',
    card: { value: 12, bulls: 1 },
    penaltyCards: [{ value: 10, bulls: 3 }]
  }];

  const publicView = manager.getPublicView('4821');
  const privateView = manager.getPrivateView('4821', 'socket-1');
  publicView.rows[0][0].value = 99;
  publicView.lastLogs[0].card.value = 99;
  publicView.lastLogs[0].penaltyCards[0].value = 99;
  privateView.hand[0].value = 99;

  assert.equal(room.rows[0][0].value, 10);
  assert.equal(room.lastLogs[0].card.value, 12);
  assert.equal(room.lastLogs[0].penaltyCards[0].value, 10);
  assert.equal(room.hands['socket-1'][0].value, 12);
});

test('blocks non-host from starting the next round', () => {
  const manager = new RoomManager({ codeGenerator: () => '4821', rng: () => 0.42 });
  manager.createRoom('socket-1', 'Pim');
  manager.joinRoom('4821', 'socket-2', 'Friend');
  manager.startGame('4821', 'socket-1');
  const room = manager.requireRoom('4821');
  room.rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  room.hands = {
    'socket-1': [{ value: 12, bulls: 1 }],
    'socket-2': [{ value: 32, bulls: 1 }]
  };
  manager.chooseCard('4821', 'socket-1', 12);
  manager.chooseCard('4821', 'socket-2', 32);
  manager.resolveCards('4821', 'socket-1');

  assert.equal(manager.getPublicView('4821').phase, 'round-over');
  assert.throws(() => manager.nextRound('4821', 'socket-2'), /Only the host can continue/);
});
