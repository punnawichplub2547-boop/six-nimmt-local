import {
  cloneCard,
  cloneLog,
  clonePlayedCard,
  cloneRows,
  continueAfterRowChoice,
  createRound,
  getRowPenalty,
  resolvePlayedCards,
  sortHand
} from './rules.js';

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const DEFAULT_STARTING_HP = 66;
const MIN_STARTING_HP = 1;
const MAX_STARTING_HP = 500;

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
      startingHp: DEFAULT_STARTING_HP,
      players: [{ id: socketId, name: cleanName, hp: DEFAULT_STARTING_HP, connected: true }],
      hands: {},
      rows: [],
      selectedCards: {},
      revealedCards: [],
      roundPenaltyCards: {},
      turn: 0,
      pending: null,
      lastLogs: []
    };
    this.rooms.set(code, room);
    return this.getPublicView(code);
  }

  joinRoom(code, socketId, name) {
    const room = this.requireRoom(code);
    const cleanName = validateName(name);
    if (room.players.some((player) => player.id === socketId)) {
      throw new Error('Player already joined');
    }
    const existingNamePlayer = room.players.find((player) => sameName(player.name, cleanName));
    if (existingNamePlayer) {
      if (existingNamePlayer.connected) throw new Error('Name already used');
      return reclaimSeat(room, existingNamePlayer, socketId);
    }

    if (room.phase !== 'lobby') throw new Error('Game already started');
    if (room.players.length >= MAX_PLAYERS) throw new Error('Room is full');
    room.players.push({ id: socketId, name: cleanName, hp: room.startingHp, connected: true });
    return this.getPublicView(room.code);
  }

  startGame(code, socketId, options = {}) {
    const room = this.requireRoom(code);
    if (room.phase !== 'lobby') throw new Error('Game already started');
    if (room.hostId !== socketId) throw new Error('Only the host can start');
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      throw new Error('Need 2-4 players');
    }
    room.startingHp = validateStartingHp(options.startingHp ?? room.startingHp);
    for (const player of room.players) player.hp = room.startingHp;
    this.startNewRound(room);
    return this.getPublicView(room.code);
  }

  startNewRound(room) {
    const playerIds = room.players.map((player) => player.id);
    const round = createRound(playerIds, this.rng);
    room.phase = 'choosing';
    room.hands = round.hands;
    room.rows = round.rows;
    room.selectedCards = {};
    room.revealedCards = [];
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
      room.revealedCards = revealedCards(room);
      room.phase = 'reveal';
    }

    return this.getPublicView(room.code);
  }

  resolveCards(code, socketId) {
    const room = this.requireRoom(code);
    if (room.phase !== 'reveal') throw new Error('No revealed cards to resolve');
    if (room.hostId !== socketId) throw new Error('Only the host can resolve cards');
    this.resolveTurn(room);
    return this.getPublicView(room.code);
  }

  resolveTurn(room) {
    room.phase = 'resolving';
    const playedCards = room.revealedCards.length > 0 ? room.revealedCards : revealedCards(room);
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
    return this.getPublicView(room.code);
  }

  applyResolutionResult(room, result) {
    room.rows = result.rows;
    room.lastLogs = result.logs.slice(-8);

    if (result.pending) {
      applyHpDamage(room, result.penaltyCardsByPlayer);
      if (isGameOver(room)) {
        endGame(room);
        return;
      }
      room.pending = {
        ...result.pending,
        penaltyCardsByPlayer: {}
      };
      room.phase = 'choose-row';
      return;
    }

    applyHpDamage(room, result.penaltyCardsByPlayer);
    if (isGameOver(room)) {
      endGame(room);
      return;
    }

    room.pending = null;
    room.selectedCards = {};
    room.revealedCards = [];

    const roundFinished = Object.values(room.hands).every((hand) => hand.length === 0);
    if (roundFinished) {
      this.finishRound(room);
      return;
    }

    room.turn += 1;
    room.phase = 'choosing';
  }

  finishRound(room) {
    room.phase = 'round-over';
  }

  nextRound(code, socketId) {
    const room = this.requireRoom(code);
    if (room.hostId !== socketId) throw new Error('Only the host can continue');
    if (room.phase !== 'round-over') throw new Error('Round is not over');
    this.startNewRound(room);
    return this.getPublicView(room.code);
  }

  getPublicView(code) {
    return publicView(this.requireRoom(code));
  }

  getPrivateView(code, socketId) {
    const room = this.requireRoom(code);
    return {
      ...publicView(room),
      myId: socketId,
      hand: roomHand(room, socketId),
      mySelected: Boolean(room.selectedCards[socketId])
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

function publicView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    startingHp: room.startingHp,
    phase: room.phase,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      hp: player.hp,
      connected: player.connected,
      isHost: player.id === room.hostId
    })),
    rows: cloneRows(room.rows),
    selectedCount: Object.keys(room.selectedCards).length,
    playerCount: room.players.length,
    turn: room.turn,
    revealedCards: room.revealedCards.map(clonePlayedCard),
    pendingPlayerId: room.pending?.playerId ?? null,
    pendingCard: room.pending ? cloneCard(room.pending.card) : null,
    lastLogs: room.lastLogs.map(cloneLog)
  };
}

function roomHand(room, socketId) {
  return room.hands[socketId] ? room.hands[socketId].map(cloneCard) : [];
}

function validateName(name) {
  const cleanName = String(name ?? '').trim().slice(0, 18);
  if (!cleanName) throw new Error('Name is required');
  return cleanName;
}

function validateStartingHp(value) {
  const hp = Number(value);
  if (!Number.isInteger(hp) || hp < MIN_STARTING_HP || hp > MAX_STARTING_HP) {
    throw new Error(`HP must be between ${MIN_STARTING_HP} and ${MAX_STARTING_HP}`);
  }
  return hp;
}

function revealedCards(room) {
  return Object.entries(room.selectedCards)
    .map(([playerId, card]) => ({ playerId, card: cloneCard(card) }))
    .sort((left, right) => left.card.value - right.card.value);
}

function applyHpDamage(room, penaltyCardsByPlayer) {
  for (const [playerId, cards] of Object.entries(penaltyCardsByPlayer)) {
    const penaltyCards = cards.map(cloneCard);
    room.roundPenaltyCards[playerId] = [...(room.roundPenaltyCards[playerId] ?? []), ...penaltyCards];
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (player) player.hp -= getRowPenalty(penaltyCards);
  }
}

function isGameOver(room) {
  return room.players.some((player) => player.hp <= 0);
}

function endGame(room) {
  room.pending = null;
  room.selectedCards = {};
  room.revealedCards = [];
  room.phase = 'game-over';
}

function sameName(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

function reclaimSeat(room, player, socketId) {
  const oldSocketId = player.id;
  replacePlayerId(room, oldSocketId, socketId);
  player.id = socketId;
  player.connected = true;
  return publicView(room);
}

function replacePlayerId(room, oldSocketId, socketId) {
  if (room.hostId === oldSocketId) room.hostId = socketId;
  transferKey(room.hands, oldSocketId, socketId);
  transferKey(room.selectedCards, oldSocketId, socketId);
  transferKey(room.roundPenaltyCards, oldSocketId, socketId);
  room.revealedCards = room.revealedCards.map((played) => ({
    ...played,
    playerId: played.playerId === oldSocketId ? socketId : played.playerId
  }));
  room.pending = replacePendingPlayerId(room.pending, oldSocketId, socketId);
  room.lastLogs = room.lastLogs.map((log) => replaceLogPlayerId(log, oldSocketId, socketId));
}

function transferKey(record, oldKey, newKey) {
  if (!Object.hasOwn(record, oldKey)) return;
  record[newKey] = record[oldKey];
  delete record[oldKey];
}

function replacePendingPlayerId(pending, oldSocketId, socketId) {
  if (!pending) return null;

  return {
    ...pending,
    playerId: pending.playerId === oldSocketId ? socketId : pending.playerId,
    playedCards: pending.playedCards?.map((played) => ({
      ...played,
      playerId: played.playerId === oldSocketId ? socketId : played.playerId
    })),
    penaltyCardsByPlayer: replaceRecordKey(pending.penaltyCardsByPlayer, oldSocketId, socketId),
    logs: pending.logs?.map((log) => replaceLogPlayerId(log, oldSocketId, socketId))
  };
}

function replaceRecordKey(record, oldKey, newKey) {
  if (!record || !Object.hasOwn(record, oldKey)) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === oldKey ? newKey : key, value])
  );
}

function replaceLogPlayerId(log, oldSocketId, socketId) {
  return {
    ...log,
    playerId: log.playerId === oldSocketId ? socketId : log.playerId
  };
}

function createRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
