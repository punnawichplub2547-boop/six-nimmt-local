import {
  SCORE_LIMIT,
  cloneCard,
  cloneLog,
  cloneRows,
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
    return this.getPublicView(code);
  }

  joinRoom(code, socketId, name) {
    const room = this.requireRoom(code);
    const cleanName = validateName(name);
    if (room.phase !== 'lobby') throw new Error('Game already started');
    if (room.players.some((player) => player.id === socketId)) {
      throw new Error('Player already joined');
    }
    if (room.players.length >= MAX_PLAYERS) throw new Error('Room is full');
    if (room.players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
      throw new Error('Name already used');
    }
    room.players.push({ id: socketId, name: cleanName, score: 0, connected: true });
    return this.getPublicView(room.code);
  }

  startGame(code, socketId) {
    const room = this.requireRoom(code);
    if (room.phase !== 'lobby') throw new Error('Game already started');
    if (room.hostId !== socketId) throw new Error('Only the host can start');
    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      throw new Error('Need 2-4 players');
    }
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

    return this.getPublicView(room.code);
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
    return this.getPublicView(room.code);
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
    phase: room.phase,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.connected,
      isHost: player.id === room.hostId
    })),
    rows: cloneRows(room.rows),
    selectedCount: Object.keys(room.selectedCards).length,
    playerCount: room.players.length,
    turn: room.turn,
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

function createRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
