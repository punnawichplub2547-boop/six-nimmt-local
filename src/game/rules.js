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

export function cloneCard(card) {
  return { ...card };
}

export function clonePlayedCard(playedCard) {
  return {
    playerId: playedCard.playerId,
    card: cloneCard(playedCard.card)
  };
}

export function clonePenaltyCardsByPlayer(penaltyCardsByPlayer) {
  return Object.fromEntries(
    Object.entries(penaltyCardsByPlayer).map(([playerId, penaltyCards]) => [
      playerId,
      penaltyCards.map(cloneCard)
    ])
  );
}

export function cloneLog(log) {
  return {
    ...log,
    ...(log.card ? { card: cloneCard(log.card) } : {}),
    ...(log.penaltyCards ? { penaltyCards: log.penaltyCards.map(cloneCard) } : {})
  };
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
      hands[playerId].push(cloneCard(deck[cursor]));
      cursor += 1;
    }
  }

  for (const playerId of playerIds) {
    hands[playerId] = sortHand(hands[playerId]);
  }

  const rows = [];
  for (let rowIndex = 0; rowIndex < ROW_COUNT; rowIndex += 1) {
    rows.push([cloneCard(deck[cursor])]);
    cursor += 1;
  }

  return {
    hands,
    rows,
    remainingDeck: deck.slice(cursor).map(cloneCard)
  };
}

export function createRound(playerIds, rng = Math.random) {
  return dealHands(shuffleDeck(createDeck(), rng), playerIds);
}

export function getRowPenalty(row) {
  return row.reduce((total, card) => total + card.bulls, 0);
}

export function cloneRows(rows) {
  return rows.map((row) => row.map(cloneCard));
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

export function validateRowIndex(rows, rowIndex) {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
    throw new RangeError(`Invalid row index: ${rowIndex}`);
  }
}

export function takeRowForCard(rows, rowIndex, card) {
  validateRowIndex(rows, rowIndex);
  const nextRows = cloneRows(rows);
  const penaltyCards = nextRows[rowIndex];
  nextRows[rowIndex] = [cloneCard(card)];
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
  const sorted = playedCards.map(clonePlayedCard).sort((a, b) => a.card.value - b.card.value);
  let nextRows = cloneRows(rows);
  const nextPenaltyCardsByPlayer = clonePenaltyCardsByPlayer(penaltyCardsByPlayer);
  const nextLogs = logs.map(cloneLog);

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
        ...result.penaltyCards.map(cloneCard)
      ];
    }
    nextLogs.push(cloneLog(result.log));
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
    ...clonePenaltyCardsByPlayer(pending.penaltyCardsByPlayer),
    [pending.playerId]: [
      ...(pending.penaltyCardsByPlayer[pending.playerId] ?? []).map(cloneCard),
      ...takeResult.penaltyCards.map(cloneCard)
    ]
  };
  const logs = [
    ...pending.logs.map(cloneLog),
    {
      type: 'choose-row',
      playerId: pending.playerId,
      card: cloneCard(pending.card),
      rowIndex,
      penaltyCards: takeResult.penaltyCards.map(cloneCard)
    }
  ];

  return resolvePlayedCards(
    takeResult.rows,
    pending.playedCards,
    pending.nextIndex + 1,
    logs,
    penaltyCardsByPlayer
  );
}
