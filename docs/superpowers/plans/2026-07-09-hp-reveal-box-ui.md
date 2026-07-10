# HP Reveal Box UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add host-configurable HP, an ordered reveal phase, row slot danger cues, and a board-game-box-inspired visual refresh.

**Architecture:** Keep the existing Express/Socket.IO/vanilla JS structure. Add HP and reveal state to `RoomManager`, expose one new `resolve-cards` socket event, update the client renderer, and restyle through `public/styles.css`.

**Tech Stack:** Node.js `node:test`, Express, Socket.IO, vanilla HTML/CSS/JS.

---

### Task 1: HP Rule Model

**Files:**
- Modify: `src/game/rooms.js`
- Modify: `src/game/rooms.test.js`

- [ ] Add failing room tests for default HP, custom host HP, immediate HP damage, and game-over at zero HP.
- [ ] Implement `DEFAULT_STARTING_HP`, `validateStartingHp`, player `hp`, and immediate damage application.
- [ ] Update public/private views and winner logic to use HP.
- [ ] Run `node --test src\game\rooms.test.js`.

### Task 2: Reveal Phase

**Files:**
- Modify: `src/game/rooms.js`
- Modify: `src/game/rooms.test.js`
- Modify: `src/server.js`

- [ ] Add failing tests proving all chosen cards enter `reveal` sorted by value.
- [ ] Add `resolveCards(code, socketId)` with host-only control.
- [ ] Add `resolve-cards` Socket.IO event.
- [ ] Run `npm.cmd test`.

### Task 3: Client Workflow

**Files:**
- Modify: `public/client.js`
- Modify: `public/styles.css`

- [ ] Add lobby HP input for host and HP display for guests.
- [ ] Render `reveal` phase with owner names and sorted cards.
- [ ] Add host-only `Resolve Cards` button.
- [ ] Render rows as five slots with the fifth slot highlighted.

### Task 4: Box-Style Visual Refresh

**Files:**
- Modify: `public/styles.css`
- Modify: `public/index.html`

- [ ] Apply yellow patterned background and red/purple/green accents.
- [ ] Restyle title, panels, table, score/HP rows, reveal strip, and card slots.
- [ ] Keep all text readable on desktop and mobile.

### Task 5: Verification

**Files:**
- Test only.

- [ ] Run `npm.cmd test`.
- [ ] Run `node --check src\server.js` and `node --check public\client.js`.
- [ ] Restart local server and test create/join/start/reveal/resolve in two Playwright sessions.
- [ ] Capture desktop and mobile screenshots.
