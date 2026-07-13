const socket = io();
const app = document.querySelector('#app');
const ACK_TIMEOUT_MS = 8000;

let state = null;
let error = '';
let busyEvent = '';
let clientSelectedCard = null;

renderHome();

socket.on('state', (nextState) => {
  const previousState = state;
  state = nextState;
  error = '';
  busyEvent = '';
  if (nextState.phase !== 'choosing') {
    clientSelectedCard = null;
  }

  const animatePhases = ['choosing', 'choose-row', 'round-over', 'game-over'];
  if (previousState && 
      (previousState.phase === 'reveal' || previousState.phase === 'choose-row') && 
      animatePhases.includes(nextState.phase)) {
    startResolveAnimation(previousState, nextState);
  } else {
    render();
  }
});

socket.on('disconnect', () => {
  busyEvent = '';
  error = 'Connection lost. Rejoin the room with the same name to continue.';
  render();
});

function emit(eventName, payload = {}) {
  if (busyEvent) return;

  busyEvent = eventName;
  render();

  socket.timeout(ACK_TIMEOUT_MS).emit(eventName, payload, (ackError, response = {}) => {
    busyEvent = '';

    if (ackError) {
      error = 'No reply from the table. Try again.';
      render();
      return;
    }

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

let isAnimatingResolve = false;
let countdownInterval = null;

function startRevealCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  
  countdownInterval = setInterval(() => {
    const timerEl = document.querySelector('#reveal-timer');
    if (!timerEl || !state || state.phase !== 'reveal') {
      clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }
    
    const secondsLeft = Math.max(0, Math.ceil((state.revealEndTime - Date.now()) / 1000));
    timerEl.textContent = secondsLeft;
    
    if (secondsLeft <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }, 200);
}

function startResolveAnimation(previousState, nextState) {
  const nextLogs = nextState.lastLogs || [];
  const prevLogs = previousState.lastLogs || [];
  const newLogs = getNewLogs(prevLogs, nextLogs);

  if (newLogs.length === 0) {
    state = nextState;
    render();
    return;
  }

  isAnimatingResolve = true;
  let currentAnimatingState = JSON.parse(JSON.stringify(previousState));

  let logIndex = 0;

  function processNextLog() {
    if (logIndex >= newLogs.length) {
      isAnimatingResolve = false;
      state = nextState;
      render();
      return;
    }

    const log = newLogs[logIndex];
    logIndex++;

    const cardValue = log.card?.value;
    let startRect = null;
    if (cardValue) {
      const revealEl = document.querySelector(`.reveal-cards [data-card="${cardValue}"], .pending-banner [data-card="${cardValue}"]`);
      if (revealEl) {
        startRect = revealEl.getBoundingClientRect();
        console.log(`[Animation Debug] Card ${cardValue} - Measured start Rect:`, startRect);
      } else {
        console.warn(`[Animation Debug] Card ${cardValue} - Could NOT find reveal element`);
      }
    }

    // Clear previous flash states
    for (const r of currentAnimatingState.rows) {
      delete r.justTaken;
      for (const c of r) {
        delete c.justPlaced;
      }
    }

    applyLogToState(currentAnimatingState, log);
    
    currentAnimatingState.lastLogs.push(log);
    if (currentAnimatingState.lastLogs.length > 8) {
      currentAnimatingState.lastLogs.shift();
    }

    state = currentAnimatingState;
    render();

    if (cardValue && startRect) {
      const placedEl = document.querySelector(`.rows [data-card="${cardValue}"]`);
      if (placedEl) {
        const endRect = placedEl.getBoundingClientRect();
        console.log(`[Animation Debug] Card ${cardValue} - Measured end Rect:`, endRect);
        const deltaX = startRect.left - endRect.left;
        const deltaY = startRect.top - endRect.top;
        console.log(`[Animation Debug] Card ${cardValue} - Computed offset: deltaX=${deltaX}px, deltaY=${deltaY}px`);

        // Reset any inline transform and apply FLIP starting coordinate
        placedEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        placedEl.style.transition = 'none';
        placedEl.style.zIndex = '1000';

        // Force a style reflow to apply the inline transform instantly
        placedEl.offsetHeight;

        // Apply transition to target position in the next paint frame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            placedEl.classList.add('flying-card');
            placedEl.style.transform = 'none';
            placedEl.style.transition = 'transform 0.85s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.85s ease';
          });
        });
      } else {
        console.warn(`[Animation Debug] Card ${cardValue} - Could NOT find target placed element in row`);
      }
    }

    setTimeout(processNextLog, 1300);
  }

  processNextLog();
}

function getNewLogs(prevLogs, nextLogs) {
  return nextLogs.filter(log => {
    return !prevLogs.some(pl => 
      pl.type === log.type && 
      pl.playerId === log.playerId && 
      pl.card?.value === log.card?.value &&
      pl.rowIndex === log.rowIndex
    );
  });
}

function applyLogToState(animState, log) {
  const cardValue = log.card?.value;
  if (!cardValue) return;

  if (animState.revealedCards) {
    animState.revealedCards = animState.revealedCards.filter(c => c.card.value !== cardValue);
  }

  if (animState.pendingCard && animState.pendingCard.value === cardValue) {
    animState.pendingCard = null;
    animState.pendingPlayerId = null;
  }

  if (log.type === 'place-card') {
    const row = animState.rows[log.rowIndex];
    if (row && !row.some(c => c.value === cardValue)) {
      row.push({ ...log.card, justPlaced: true });
    }
  } else if (log.type === 'take-row' || log.type === 'choose-row') {
    const row = animState.rows[log.rowIndex];
    if (row) {
      const penalty = row.reduce((sum, c) => sum + c.bulls, 0);
      const player = animState.players.find(p => p.id === log.playerId);
      if (player) {
        player.hp = Math.max(0, player.hp - penalty);
      }
      animState.rows[log.rowIndex] = [{ ...log.card, justPlaced: true }];
      animState.rows[log.rowIndex].justTaken = true;
    }
  } else if (log.type === 'needs-row-choice') {
    animState.phase = 'choose-row';
    animState.pendingCard = log.card;
    animState.pendingPlayerId = log.playerId;
  }
}

function render() {
  if (!isAnimatingResolve && countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (!state) {
    renderHome();
    return;
  }

  if (state.phase === 'lobby') {
    renderLobby();
    return;
  }

  renderGame();

  if (state.phase === 'reveal' && !isAnimatingResolve) {
    startRevealCountdown();
  }
}

function renderHome() {
  app.innerHTML = `
    <section class="home-screen" aria-labelledby="home-title">
      <div class="brand-panel">
        <div class="logo-wrapper">
          <h1 id="home-title">6 Nimmt</h1>
          <div class="green-slash"></div>
        </div>
        <p class="slogan">Not a Game for the Bullheaded!</p>
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

  const brandPanel = document.querySelector('.brand-panel');
  if (brandPanel) {
    brandPanel.addEventListener('mousemove', (event) => {
      const rect = brandPanel.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const px = x / rect.width;
      const py = y / rect.height;
      const rx = (0.5 - py) * 22; // up to 11 deg rotation X
      const ry = (px - 0.5) * 22; // up to 11 deg rotation Y
      brandPanel.style.setProperty('--rx', rx.toFixed(2));
      brandPanel.style.setProperty('--ry', ry.toFixed(2));
    });
    brandPanel.addEventListener('mouseleave', () => {
      brandPanel.style.setProperty('--rx', '0');
      brandPanel.style.setProperty('--ry', '0');
    });
  }

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

  const maxSeats = 10;
  let seatsHtml = '';
  for (let i = 0; i < maxSeats; i++) {
    const player = state.players[i];
    if (player) {
      const isMe = player.id === state.myId;
      const isHostPlayer = player.isHost;
      const connected = player.connected;
      const roleClass = isHostPlayer ? 'is-host' : '';
      const meClass = isMe ? 'is-me' : '';
      const statusClass = connected ? '' : 'is-offline';
      
      const initials = player.name ? player.name.charAt(0).toUpperCase() : '?';
      const badge = isHostPlayer ? 'Host' : (isMe ? 'You' : (connected ? 'Ready' : 'Offline'));
      
      seatsHtml += `
        <div class="player-seat-card ${roleClass} ${meClass} ${statusClass}">
          <div class="player-seat-avatar">${initials}</div>
          <div class="player-seat-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</div>
          <div class="player-seat-badge">${badge}</div>
        </div>
      `;
    } else {
      seatsHtml += `
        <div class="seat-slot empty-seat">
          <div class="seat-number">${i + 1}</div>
          <div class="seat-status">Empty Seat</div>
        </div>
      `;
    }
  }

  app.innerHTML = `
    <section class="lobby-screen" aria-labelledby="lobby-title">
      <div class="lobby-ticket-container">
        <div class="lobby-ticket">
          <p class="kicker">ROOM TICKET</p>
          <h1 id="lobby-title">${escapeHtml(state.code)}</h1>
          <p>Join from the same Wi-Fi using this code.</p>
          <button type="button" id="copy-code-btn" class="copy-btn">Copy Ticket Code</button>
        </div>
      </div>

      <div class="lobby-table-surface">
        <div class="lobby-table-heading">
          <h2>Game Table <span>${state.players.length}/10</span></h2>
        </div>
        <div class="seats-grid">
          ${seatsHtml}
        </div>
      </div>

      <div class="lobby-wooden-board">
        <div>
          <p class="hp-label-wood">${isHost ? 'Configure Starting HP' : 'Game Table Settings'}</p>
          <p class="muted-note" style="color: #c0b094; text-shadow: 1px 1px 0 #000; font-size: 0.8rem; margin-top: 2px;">
            ${isHost ? 'Set HP limit and start when ready' : 'Waiting for host to deal starting deck'}
          </p>
        </div>
        
        <div class="vintage-counter">
          <p style="color: #f7e1b5; font-size: 0.9rem; font-weight: 850; margin: 0;">Starting HP</p>
          <div class="vintage-counter-controls">
            ${isHost 
              ? `<button type="button" id="hp-dec-btn" class="vintage-dial-btn">&minus;</button>
                 <input type="number" id="starting-hp-input" class="vintage-score-card-input" min="1" max="500" value="${escapeHtml(state.startingHp || 66)}">
                 <button type="button" id="hp-inc-btn" class="vintage-dial-btn">&plus;</button>`
              : `<div class="vintage-score-card">${escapeHtml(state.startingHp || 66)}</div>`
            }
          </div>
        </div>

        <button id="start" type="button" class="${canStart ? 'primary-action start-pulsing' : 'primary-action'}" ${canStart ? '' : 'disabled'} style="box-shadow: 0 6px 12px rgba(0,0,0,0.4);">
          Start Game
        </button>
      </div>

      ${renderError()}
    </section>
  `;

  // Attach Copy button event listener
  document.querySelector('#copy-code-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(state.code).then(() => {
      const btn = document.querySelector('#copy-code-btn');
      if (btn) {
        const oldText = btn.textContent;
        btn.textContent = 'Copied! ✓';
        btn.style.color = '#2e7d32';
        btn.style.borderColor = '#2e7d32';
        setTimeout(() => {
          btn.textContent = oldText;
          btn.style.color = '';
          btn.style.borderColor = '';
        }, 2000);
      }
    });
  });

  // Attach dial counter listeners for host
  if (isHost) {
    const hpInput = document.querySelector('#starting-hp-input');
    
    if (hpInput) {
      hpInput.addEventListener('input', (event) => {
        const val = Number(event.target.value);
        if (val >= 1 && val <= 500) {
          state.startingHp = val;
        }
      });
      hpInput.addEventListener('blur', (event) => {
        let val = Number(event.target.value);
        if (!val || val < 1) val = 1;
        if (val > 500) val = 500;
        hpInput.value = val;
        state.startingHp = val;
        emit('update-hp', { startingHp: val });
      });
    }

    document.querySelector('#hp-dec-btn')?.addEventListener('click', () => {
      if (hpInput) {
        const current = Number(hpInput.value);
        const next = Math.max(1, current - 1);
        hpInput.value = next;
        state.startingHp = next;
        emit('update-hp', { startingHp: next });
      }
    });

    document.querySelector('#hp-inc-btn')?.addEventListener('click', () => {
      if (hpInput) {
        const current = Number(hpInput.value);
        const next = Math.min(500, current + 1);
        hpInput.value = next;
        state.startingHp = next;
        emit('update-hp', { startingHp: next });
      }
    });
  }

  document.querySelector('#start').addEventListener('click', () => {
    const hpInput = document.querySelector('#starting-hp-input');
    const startingHp = hpInput ? Number(hpInput.value) : (state.startingHp || 66);
    emit('start-game', { startingHp });
  });
}

function renderGame() {
  const actionBusy = Boolean(busyEvent) || isAnimatingResolve;
  const choosingCard = state.phase === 'choosing' && !state.mySelected && !actionBusy;
  const waitingForCards = state.phase === 'choosing' && state.mySelected;
  const choosingRow = state.phase === 'choose-row' && state.pendingPlayerId === state.myId && !actionBusy;
  const handTitle = waitingForCards || state.phase === 'reveal' ? 'Card chosen' : 'Your hand';

  app.innerHTML = `
    <section class="game-shell" aria-label="Game table">
      <section class="table-panel">
        <header class="table-topbar">
          <div>
            <span class="room-chip">Room ${escapeHtml(state.code)}</span>
            <strong>${escapeHtml(phaseText())}</strong>
          </div>
          <div class="turn-meter" aria-label="Round turn">Turn ${escapeHtml(state.turn || 0)} / 10</div>
        </header>

        ${renderPendingCard()}
        ${renderReveal()}

        <div class="rows" aria-label="Table rows">
          ${state.rows.map((row, index) => renderRow(row, index, choosingRow)).join('')}
        </div>

        <section class="hand-panel" aria-labelledby="hand-title">
          <div class="hand-heading">
            <h2 id="hand-title">${handTitle}</h2>
            ${clientSelectedCard && choosingCard
              ? `<button id="confirm-card" type="button" class="primary-action confirm-btn">Confirm Card ${clientSelectedCard}</button>`
              : `<span>${escapeHtml(handStatusText())}</span>`}
          </div>
          <div class="cards hand-cards">
            ${(state.hand || []).map((card) => renderCard(card, { 
              selectable: choosingCard, 
              clientSelected: card.value === clientSelectedCard 
            })).join('')}
          </div>
        </section>
      </section>

      <aside class="side-panel" aria-label="Game status">
        <section class="side-section">
          <div class="panel-heading">
            <h2>HP</h2>
            <span>${state.playerCount || state.players.length} players</span>
          </div>
          <div class="player-list">
            ${state.players.map(renderPlayer).join('')}
          </div>
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

  if (choosingCard) {
    document.querySelectorAll('.hand-cards button[data-card]').forEach((cardButton) => {
      cardButton.addEventListener('click', () => {
        if (busyEvent) return;
        const val = Number(cardButton.dataset.card);
        if (clientSelectedCard === val) {
          clientSelectedCard = null;
        } else {
          clientSelectedCard = val;
        }
        render();
      });
    });

    document.querySelector('#confirm-card')?.addEventListener('click', () => {
      if (busyEvent || !clientSelectedCard) return;
      emit('choose-card', { value: clientSelectedCard });
      clientSelectedCard = null;
    });
  }

  document.querySelectorAll('[data-row]').forEach((rowChoice) => {
    const chooseRow = () => {
      if (busyEvent) return;
      emit('choose-row', { rowIndex: Number(rowChoice.dataset.row) });
    };

    rowChoice.addEventListener('click', chooseRow);
    rowChoice.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      chooseRow();
    });
  });

  document.querySelector('#next-round')?.addEventListener('click', () => {
    if (busyEvent) return;
    emit('next-round', {});
  });

  document.querySelector('#resolve-cards')?.addEventListener('click', () => {
    if (busyEvent) return;
    emit('resolve-cards', {});
  });

  document.querySelector('#restart-game')?.addEventListener('click', () => {
    if (busyEvent) return;
    emit('restart-game', {});
  });
}

function renderRow(row, index, choosingRow) {
  const rowPenalty = (row || []).reduce((total, card) => total + Number(card.bulls || 0), 0);
  const rowClass = [
    'table-row',
    choosingRow ? 'row-choice' : '',
    row.length >= 5 ? 'row-full' : '',
    row.justTaken ? 'row-taken-flash' : ''
  ].filter(Boolean).join(' ');
  const rowAttributes = choosingRow
    ? `role="button" tabindex="0" data-row="${index}" aria-label="Take row ${index + 1} for ${rowPenalty} HP damage"`
    : '';

  return `
    <div class="${rowClass}" ${rowAttributes}>
      <span class="row-label">R${index + 1}</span>
      <span class="row-cards cards">${renderRowSlots(row || [])}</span>
      <span class="row-penalty">${rowPenalty} HP<span class="desktop-only"> damage</span></span>
    </div>
  `;
}

function renderRowSlots(row) {
  const totalSlots = Math.max(5, row.length + 1);
  return Array.from({ length: totalSlots }, (_, index) => {
    const card = row[index];
    const isDanger = index === 5;
    const slotClasses = [
      'card-slot',
      isDanger ? 'danger-slot' : '',
      card ? 'filled-slot' : 'empty-slot'
    ].filter(Boolean).join(' ');

    return `
      <span class="${slotClasses}" aria-label="${isDanger ? 'Danger slot' : `Slot ${index + 1}`}">
        ${card ? renderCard(card, { compact: true }) : '<span class="slot-number"></span>'}
      </span>
    `;
  }).join('');
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
    pending ? 'pending-card-art' : '',
    card?.justPlaced ? 'just-placed' : ''
  ].filter(Boolean).join(' ');
  const attributes = `data-card="${value}" aria-label="${selectable ? 'Choose card' : 'Card'} ${value}, ${bulls} penalty points"`;
  const tagName = selectable ? 'button' : 'span';
  const buttonType = selectable ? ' type="button"' : '';

  return `
    <${tagName}${buttonType} class="${className}" ${attributes}>
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
    </${tagName}>
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
        <p>Pending card ${escapeHtml(state.pendingCard.value)} is lower than every row end. Choose the lowest HP damage you can live with.</p>
      </div>
      ${renderCard(state.pendingCard, { pending: true })}
    </section>
  `;
}

function renderReveal() {
  if (state.phase !== 'reveal') return '';

  return `
    <section class="reveal-panel" aria-live="polite">
      <div class="reveal-heading">
        <h2>Cards revealed</h2>
        <span>Lowest card resolves first</span>
      </div>
      <div class="reveal-cards">
        ${(state.revealedCards || []).map((played) => `
          <div class="revealed-card">
            <strong>${escapeHtml(playerName(played.playerId))}</strong>
            ${renderCard(played.card, { pending: true })}
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderRoundAction() {
  if (state.phase === 'reveal') {
    const secondsLeft = Math.max(0, Math.ceil((state.revealEndTime - Date.now()) / 1000));
    return `<p class="reveal-countdown-note">Placing cards automatically in <strong id="reveal-timer">${secondsLeft}</strong> seconds...</p>`;
  }

  if (state.phase === 'round-over' && state.myId === state.hostId) {
    return `<button id="next-round" type="button" class="primary-action" ${busyEvent ? 'disabled' : ''}>Next Round</button>`;
  }

  if (state.phase === 'round-over') {
    return '<p class="muted-note">Waiting for the host to start the next round.</p>';
  }

  if (state.phase === 'game-over') {
    const winner = [...state.players].sort((a, b) => b.hp - a.hp)[0];
    return `
      <p class="game-over-note">Game over. Most HP left wins: ${escapeHtml(winner?.name || 'Player')}.</p>
      ${state.myId === state.hostId
        ? `<button id="restart-game" type="button" class="primary-action confirm-btn" style="margin-top: 10px;">Return to Lobby</button>`
        : `<p class="muted-note" style="margin-top: 10px;">Waiting for the host to restart the game.</p>`}
    `;
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
      <strong>${escapeHtml(player.hp)} HP</strong>
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
    return `<p class="log-entry">${name} played ${escapeHtml(card)} and lost ${escapeHtml(penalty)} HP on row ${escapeHtml(row)}.</p>`;
  }

  if (log.type === 'choose-row') {
    const penalty = (log.penaltyCards || []).reduce((total, cardItem) => total + Number(cardItem.bulls || 0), 0);
    return `<p class="log-entry">${name} chose row ${escapeHtml(row)} for ${escapeHtml(card)} and lost ${escapeHtml(penalty)} HP.</p>`;
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
  if (state.phase === 'reveal') return 'Cards revealed';
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
  if (state.phase === 'reveal') return 'Everyone picked. Study the order before cards are placed.';
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
