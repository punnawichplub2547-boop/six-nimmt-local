const socket = io();
const app = document.querySelector('#app');

let state = null;
let error = '';
let busyEvent = '';

renderHome();

socket.on('state', (nextState) => {
  state = nextState;
  error = '';
  busyEvent = '';
  render();
});

function emit(eventName, payload = {}) {
  busyEvent = eventName;
  render();

  socket.emit(eventName, payload, (response = {}) => {
    busyEvent = '';

    if (!response.ok) {
      error = response.error || 'Something went wrong';
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

  if (state.phase === 'lobby') {
    renderLobby();
    return;
  }

  renderGame();
}

function renderHome() {
  app.innerHTML = `
    <section class="home-screen" aria-labelledby="home-title">
      <div class="brand-panel">
        <p class="kicker">Same Wi-Fi table</p>
        <h1 id="home-title">6 Nimmt Local</h1>
        <p class="lede">Create a room, pass the code around, and play fast card chaos with 2-4 friends.</p>
      </div>

      <div class="home-grid">
        <form id="create-form" class="panel form-panel">
          <h2>Create Room</h2>
          <label>
            <span>Your name</span>
            <input name="name" maxlength="18" autocomplete="nickname" placeholder="Pim" required>
          </label>
          <button type="submit" class="primary-action" ${busyEvent ? 'disabled' : ''}>Create Room</button>
        </form>

        <form id="join-form" class="panel form-panel">
          <h2>Join Room</h2>
          <label>
            <span>Room code</span>
            <input name="code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="4821" required>
          </label>
          <label>
            <span>Your name</span>
            <input name="name" maxlength="18" autocomplete="nickname" placeholder="Friend" required>
          </label>
          <button type="submit" class="primary-action" ${busyEvent ? 'disabled' : ''}>Join Room</button>
        </form>
      </div>

      ${renderError()}
    </section>
  `;

  document.querySelector('#create-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    emit('create-room', { name: form.get('name') });
  });

  document.querySelector('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    emit('join-room', { code: form.get('code'), name: form.get('name') });
  });
}

function renderLobby() {
  const isHost = state.myId === state.hostId;
  const canStart = isHost && state.players.length >= 2 && !busyEvent;

  app.innerHTML = `
    <section class="lobby-screen" aria-labelledby="lobby-title">
      <div class="lobby-code panel">
        <p class="kicker">Room code</p>
        <h1 id="lobby-title">${escapeHtml(state.code)}</h1>
        <p>Friends can join from the same Wi-Fi using this code.</p>
      </div>

      <div class="panel lobby-list">
        <div class="panel-heading">
          <h2>Players</h2>
          <span>${state.players.length}/4</span>
        </div>
        ${state.players.map(renderPlayer).join('')}
      </div>

      <div class="panel lobby-actions">
        <p>${isHost ? 'Start when at least one friend has joined.' : 'Waiting for the host to start.'}</p>
        <button id="start" type="button" class="primary-action" ${canStart ? '' : 'disabled'}>
          Start Game
        </button>
      </div>

      ${renderError()}
    </section>
  `;

  document.querySelector('#start').addEventListener('click', () => emit('start-game', {}));
}

function renderGame() {
  const choosingCard = state.phase === 'choosing' && !state.mySelected;
  const waitingForCards = state.phase === 'choosing' && state.mySelected;
  const choosingRow = state.phase === 'choose-row' && state.pendingPlayerId === state.myId;

  app.innerHTML = `
    <section class="game-shell" aria-label="Game table">
      <main class="table-panel">
        <header class="table-topbar">
          <div>
            <span class="room-chip">Room ${escapeHtml(state.code)}</span>
            <strong>${escapeHtml(phaseText())}</strong>
          </div>
          <div class="turn-meter" aria-label="Round turn">Turn ${escapeHtml(state.turn || 0)} / 10</div>
        </header>

        ${renderPendingCard()}

        <div class="rows" aria-label="Table rows">
          ${state.rows.map((row, index) => renderRow(row, index, choosingRow)).join('')}
        </div>

        <section class="hand-panel" aria-labelledby="hand-title">
          <div class="hand-heading">
            <h2 id="hand-title">${waitingForCards ? 'Card chosen' : 'Your hand'}</h2>
            <span>${escapeHtml(handStatusText())}</span>
          </div>
          <div class="cards hand-cards">
            ${(state.hand || []).map((card) => renderCard(card, { selectable: choosingCard })).join('')}
          </div>
        </section>
      </main>

      <aside class="side-panel" aria-label="Game status">
        <section class="side-section">
          <div class="panel-heading">
            <h2>Scores</h2>
            <span>${state.playerCount || state.players.length} players</span>
          </div>
          ${state.players.map(renderPlayer).join('')}
        </section>

        <section class="side-section">
          <h2>Status</h2>
          <dl class="status-list">
            <div>
              <dt>Phase</dt>
              <dd>${escapeHtml(phaseText())}</dd>
            </div>
            <div>
              <dt>Chosen</dt>
              <dd>${escapeHtml(state.selectedCount || 0)} / ${escapeHtml(state.playerCount || state.players.length)}</dd>
            </div>
          </dl>
          ${renderRoundAction()}
        </section>

        <section class="side-section">
          <h2>Move Log</h2>
          <div class="log-list">
            ${(state.lastLogs || []).map(renderLog).join('') || '<p class="log-entry">No moves yet.</p>'}
          </div>
        </section>

        ${renderError()}
      </aside>
    </section>
  `;

  document.querySelectorAll('[data-card]').forEach((cardButton) => {
    cardButton.addEventListener('click', () => {
      emit('choose-card', { value: Number(cardButton.dataset.card) });
    });
  });

  document.querySelectorAll('[data-row]').forEach((rowButton) => {
    rowButton.addEventListener('click', () => {
      emit('choose-row', { rowIndex: Number(rowButton.dataset.row) });
    });
  });

  document.querySelector('#next-round')?.addEventListener('click', () => emit('next-round', {}));
}

function renderRow(row, index, choosingRow) {
  const rowPenalty = (row || []).reduce((total, card) => total + Number(card.bulls || 0), 0);
  const rowClass = choosingRow ? 'table-row row-choice' : 'table-row';
  const rowAttributes = choosingRow
    ? `data-row="${index}" aria-label="Take row ${index + 1} worth ${rowPenalty} penalty points"`
    : 'tabindex="-1" aria-disabled="true"';

  return `
    <button type="button" class="${rowClass}" ${rowAttributes}>
      <span class="row-label">R${index + 1}</span>
      <span class="row-cards cards">${(row || []).map((card) => renderCard(card, { compact: true })).join('')}</span>
      <span class="row-penalty">${rowPenalty} bull${rowPenalty === 1 ? '' : 's'}</span>
    </button>
  `;
}

function renderCard(card, options = {}) {
  const { selectable = false, compact = false, pending = false } = options;
  const value = Number(card?.value || 0);
  const bulls = Math.max(1, Number(card?.bulls || 1));
  const className = [
    'nimmt-card',
    cardClass({ value, bulls }),
    selectable ? 'selectable' : '',
    compact ? 'compact-card' : '',
    pending ? 'pending-card-art' : ''
  ].filter(Boolean).join(' ');
  const attributes = selectable
    ? `data-card="${value}" aria-label="Choose card ${value}, ${bulls} penalty points"`
    : 'tabindex="-1" aria-disabled="true"';

  return `
    <button type="button" class="${className}" ${attributes}>
      <span class="corner tl">${value}</span>
      <span class="corner tr">${value}</span>
      <span class="pips top">${renderBullMarks(bulls)}</span>
      <span class="bull-head" aria-hidden="true">
        <span class="horn left"></span>
        <span class="horn right"></span>
        <span class="snout"></span>
      </span>
      <span class="big-number">${value}</span>
      <span class="pips bottom">${renderBullMarks(bulls)}</span>
      <span class="corner bl">${value}</span>
      <span class="corner br">${value}</span>
    </button>
  `;
}

function renderBullMarks(count) {
  return Array.from({ length: count }, () => '<span class="bull-mark"></span>').join('');
}

function cardClass(card) {
  if (card.value === 55) return 'royal';
  if (card.bulls >= 5) return 'red';
  if (card.bulls === 3) return 'gold';
  if (card.bulls === 2) return 'blue';
  return 'purple';
}

function renderPendingCard() {
  if (state.phase !== 'choose-row' || !state.pendingCard) return '';

  const player = playerName(state.pendingPlayerId);
  const chooser = state.pendingPlayerId === state.myId ? 'You need' : `${player} needs`;

  return `
    <section class="pending-banner" aria-live="polite">
      <div>
        <strong>${escapeHtml(chooser)} to take a row</strong>
        <p>Pending card ${escapeHtml(state.pendingCard.value)} is lower than every row end.</p>
      </div>
      ${renderCard(state.pendingCard, { pending: true })}
    </section>
  `;
}

function renderRoundAction() {
  if (state.phase === 'round-over' && state.myId === state.hostId) {
    return '<button id="next-round" type="button" class="primary-action">Next Round</button>';
  }

  if (state.phase === 'round-over') {
    return '<p class="muted-note">Waiting for the host to start the next round.</p>';
  }

  if (state.phase === 'game-over') {
    const winner = [...state.players].sort((a, b) => a.score - b.score)[0];
    return `<p class="game-over-note">Game over. Lowest score wins: ${escapeHtml(winner?.name || 'Player')}.</p>`;
  }

  return '';
}

function renderPlayer(player) {
  const labels = [
    player.isHost ? '<span class="player-tag">Host</span>' : '',
    player.id === state?.myId ? '<span class="player-tag you">You</span>' : '',
    player.connected ? '' : '<span class="player-tag offline">Offline</span>'
  ].join('');

  return `
    <div class="player-row">
      <span class="player-name">${escapeHtml(player.name)} ${labels}</span>
      <strong>${escapeHtml(player.score)}</strong>
    </div>
  `;
}

function renderLog(log) {
  if (log.type === 'round-start') {
    return '<p class="log-entry">New round started.</p>';
  }

  const card = log.card?.value ?? '?';
  const name = escapeHtml(playerName(log.playerId));
  const row = Number(log.rowIndex) + 1;

  if (log.type === 'place-card') {
    return `<p class="log-entry">${name} placed ${escapeHtml(card)} on row ${escapeHtml(row)}.</p>`;
  }

  if (log.type === 'take-row') {
    const penalty = (log.penaltyCards || []).reduce((total, cardItem) => total + Number(cardItem.bulls || 0), 0);
    return `<p class="log-entry">${name} played ${escapeHtml(card)} and took row ${escapeHtml(row)} for ${escapeHtml(penalty)}.</p>`;
  }

  if (log.type === 'choose-row') {
    const penalty = (log.penaltyCards || []).reduce((total, cardItem) => total + Number(cardItem.bulls || 0), 0);
    return `<p class="log-entry">${name} chose row ${escapeHtml(row)} for ${escapeHtml(card)} and took ${escapeHtml(penalty)}.</p>`;
  }

  return '<p class="log-entry">Move resolved.</p>';
}

function playerName(playerId) {
  return state.players.find((player) => player.id === playerId)?.name ?? 'Player';
}

function phaseText() {
  if (!state) return 'Home';
  if (state.phase === 'lobby') return 'Lobby';
  if (state.phase === 'choosing') return state.mySelected ? 'Waiting for friends' : 'Choose one card';
  if (state.phase === 'choose-row') {
    if (!state.pendingCard) return 'Choose a row';
    return state.pendingPlayerId === state.myId
      ? `Choose a row for ${state.pendingCard.value}`
      : `${playerName(state.pendingPlayerId)} is choosing a row for ${state.pendingCard.value}`;
  }
  if (state.phase === 'round-over') return 'Round over';
  if (state.phase === 'game-over') return 'Game over';
  if (state.phase === 'resolving') return 'Resolving cards';
  return 'Playing';
}

function handStatusText() {
  if (state.phase === 'choosing' && !state.mySelected) return 'Pick carefully. Lowest selected cards resolve first.';
  if (state.phase === 'choosing' && state.mySelected) return 'Waiting for everyone else to choose.';
  if (state.phase === 'choose-row' && state.pendingPlayerId === state.myId) return 'Choose the row you want to take.';
  if (state.phase === 'choose-row') return 'Another player is choosing a row.';
  if (state.phase === 'round-over') return 'Round complete.';
  if (state.phase === 'game-over') return 'Final scores are in.';
  return 'Cards resolve on the server.';
}

function renderError() {
  return error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : '';
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
