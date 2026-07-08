import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCardToRows,
  continueAfterRowChoice,
  createDeck,
  createRound,
  dealHands,
  getBullCount,
  getRowPenalty,
  resolvePlayedCards,
  takeRowForCard
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

test('dealHands clones dealt hands, starting rows, and remaining deck cards', () => {
  const deck = createDeck();
  const result = dealHands(deck, ['p1', 'p2']);

  assert.notEqual(result.hands.p1[0], deck[0]);
  assert.notEqual(result.rows[0][0], deck[20]);
  assert.notEqual(result.remainingDeck[0], deck[24]);

  result.hands.p1[0].value = 999;
  result.rows[0][0].value = 998;
  result.remainingDeck[0].value = 997;

  assert.equal(deck[0].value, 1);
  assert.equal(deck[20].value, 21);
  assert.equal(deck[24].value, 25);
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

test('resolvePlayedCards clones pending continuation cards and existing penalties', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  const playedCards = [
    { playerId: 'p2', card: { value: 32, bulls: 1 } },
    { playerId: 'p1', card: { value: 4, bulls: 1 } }
  ];
  const previousPenalty = { value: 99, bulls: 5 };
  const previousPenalties = [previousPenalty];
  const result = resolvePlayedCards(rows, playedCards, 0, [], { p2: previousPenalties });

  assert.equal(result.pending.playedCards[0].playerId, 'p1');
  assert.notEqual(result.pending.playedCards[0], playedCards[1]);
  assert.notEqual(result.pending.playedCards[0].card, playedCards[1].card);
  assert.notEqual(result.pending.penaltyCardsByPlayer.p2, previousPenalties);
  assert.notEqual(result.pending.penaltyCardsByPlayer.p2[0], previousPenalty);

  playedCards[1].card.value = 999;
  previousPenalty.value = 998;

  assert.equal(result.pending.playedCards[0].card.value, 4);
  assert.equal(result.pending.penaltyCardsByPlayer.p2[0].value, 99);
});

test('continueAfterRowChoice takes the chosen row and continues resolving later cards', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }], [{ value: 50, bulls: 3 }], [{ value: 70, bulls: 3 }]];
  const paused = resolvePlayedCards(rows, [
    { playerId: 'p3', card: { value: 72, bulls: 1 } },
    { playerId: 'p2', card: { value: 32, bulls: 1 } },
    { playerId: 'p1', card: { value: 4, bulls: 1 } }
  ]);

  assert.equal(paused.pending.playerId, 'p1');

  const result = continueAfterRowChoice(paused.pending, paused.rows, 1);

  assert.equal(result.pending, null);
  assert.deepEqual(result.rows[0].map((card) => card.value), [10, 32]);
  assert.deepEqual(result.rows[1].map((card) => card.value), [4]);
  assert.deepEqual(result.rows[3].map((card) => card.value), [70, 72]);
  assert.deepEqual(result.penaltyCardsByPlayer.p1.map((card) => card.value), [30]);
  assert.deepEqual(result.logs.map((entry) => entry.type), ['choose-row', 'place-card', 'place-card']);
  assert.deepEqual(result.logs.map((entry) => entry.card.value), [4, 32, 72]);
});

test('takeRowForCard validates row index', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }]];

  assert.throws(() => takeRowForCard(rows, -1, { value: 4, bulls: 1 }), {
    name: 'RangeError',
    message: 'Invalid row index: -1'
  });
  assert.throws(() => takeRowForCard(rows, 2, { value: 4, bulls: 1 }), {
    name: 'RangeError',
    message: 'Invalid row index: 2'
  });
});

test('continueAfterRowChoice validates row index', () => {
  const rows = [[{ value: 10, bulls: 3 }], [{ value: 30, bulls: 3 }]];
  const pending = {
    playerId: 'p1',
    card: { value: 4, bulls: 1 },
    playedCards: [{ playerId: 'p1', card: { value: 4, bulls: 1 } }],
    nextIndex: 0,
    logs: [],
    penaltyCardsByPlayer: {}
  };

  assert.throws(() => continueAfterRowChoice(pending, rows, 1.5), {
    name: 'RangeError',
    message: 'Invalid row index: 1.5'
  });
});
