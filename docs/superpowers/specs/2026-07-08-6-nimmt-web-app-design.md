# 6 Nimmt Web App Design

## Goal

Build a small web app version of classic 6 nimmt! for 2-4 real players on the same Wi-Fi network. The app is meant for casual play with friends, not public matchmaking or long-term hosted service use.

## Scope

The first version includes:

- Same-Wi-Fi multiplayer hosted from one computer.
- Short room code joining.
- Player names without accounts.
- 2-4 players per room.
- Classic 6 nimmt! rules.
- Private hands per device.
- Server-controlled deck, turn resolution, row placement, row taking, and scoring.
- Split Panel game layout.
- Original CSS/vector card art inspired by the classic physical card style.

The first version excludes:

- Public internet hosting.
- User accounts.
- Saved match history.
- Bots or single-player mode.
- Database persistence.
- Advanced animations.
- Chat.
- Reconnection recovery. A refreshed browser returns to the home/join screen in v1.

## Technology

Use a small Node.js application:

- `express` serves the frontend files.
- `socket.io` handles real-time room updates.
- Plain HTML, CSS, and browser JavaScript implement the frontend.
- In-memory server state stores rooms, players, hands, table rows, selected cards, scores, and round state.

This keeps the project small, understandable, and easy to run locally with `npm install` and `npm start`.

## Room Flow

1. A host opens the app and creates a room.
2. The server generates a short numeric room code, such as `4821`.
3. Friends on the same Wi-Fi open the host URL from their phone or laptop.
4. Each player enters the room code and a display name.
5. The lobby shows all joined players and a ready/start state.
6. The host starts the game when 2-4 players are present.

No passwords or accounts are required.

## Game Rules

The app follows classic 6 nimmt! rules:

- Cards are numbered 1-104.
- Each card has a penalty value.
- Each player receives 10 cards.
- Four starting cards create the four table rows.
- Each turn, every player secretly chooses one card from their hand.
- Once all players have chosen, selected cards are revealed.
- Selected cards resolve in ascending numeric order.
- A played card is placed after the row whose last card is lower than it and closest to it.
- If the target row already has five cards, the player takes those five cards as penalty cards, and their played card starts the row.
- If a played card is lower than all current row-ending cards, the player chooses which row to take, and their played card starts that row.
- After 10 turns, penalty points are added to player scores.
- A new round begins if needed.

For the small first version, the game uses a 66 point score limit. If a player reaches or exceeds 66 after a round, the lowest score wins.

## Penalty Values

Card penalty values use the classic distribution:

- `55` is worth 7 points.
- Multiples of 11 except `55` are worth 5 points.
- Multiples of 10 are worth 3 points.
- Multiples of 5 that are not multiples of 10, except `55`, are worth 2 points.
- All other cards are worth 1 point.

The frontend displays penalty symbols on each card so players can read danger at a glance.

## Game State

Each room stores:

- Room code.
- Host socket id.
- Player list.
- Player names.
- Player scores.
- Player hands.
- Player selected cards for the current turn.
- Four table rows.
- Round penalty cards per player.
- Game phase: lobby, choosing, resolving, choose-row, round-over, game-over.
- Last move log.

The server sends private state to each player:

- Their own hand.
- Public table rows.
- Public player names and scores.
- Public ready/selection count.
- Public last move log.

The server must not send other players' hands.

## Turn Resolution

When all players have selected a card:

1. Remove each selected card from its owner's hand.
2. Sort selected cards by numeric value from lowest to highest.
3. Resolve each card in that order.
4. If the card fits after a row, place it automatically.
5. If it becomes the sixth card in a row, assign the five existing row cards as penalties to that player, then replace the row with the played card.
6. If the card is lower than every row-ending card, pause resolution and ask that player to choose a row to take.
7. Continue resolution after the row choice.
8. When all selected cards resolve, advance to the next turn or end the round.

This resolution logic lives on the server so players cannot cheat by modifying browser state.

## UI Design

Use the Split Panel layout selected during brainstorming:

- Main left area: four table rows.
- Bottom area: current player's private hand.
- Right panel: room code, players, scores, selection status, round/turn count, and recent move log.

The UI should be clear on laptop and usable on phone. On narrow screens, the right panel can collapse below the rows while the private hand remains easy to tap.

Important states:

- Home screen with create room and join room.
- Lobby screen with room code, player list, and start button for host.
- Choosing screen where players pick one card.
- Waiting screen after a player has chosen.
- Row-choice screen when a player must take a row because their card is too low.
- Resolution summary showing row takes and penalty points.
- Round-over screen.
- Game-over screen.

## Card Visual Style

Cards are generated with CSS/vector-style HTML rather than scanned images.

The card style should feel close to classic 6 nimmt! cards while remaining original:

- Rounded white playing-card shape.
- Large outlined number in the center.
- Mirrored corner numbers.
- Bull-head inspired central shape.
- Penalty marks at top and bottom.
- Color-coded special penalty cards.

The app must not copy exact printed artwork from the physical game. It should use original shapes and styling that evoke the same readable card-game feel.

## Error Handling

Handle common local-play issues:

- Invalid room code shows a clear message.
- Duplicate or blank names are rejected.
- Starting with fewer than 2 players is blocked.
- Joining a full room is blocked.
- Non-host players cannot start the game.
- Players cannot select a card they do not hold.
- Players cannot submit more than one card per turn.
- Row selection is only allowed when the server is waiting for that player.
- Refreshing returns the player to the home/join flow.

## Testing

Testing should focus on game correctness:

- Penalty value calculation.
- Deck creation and shuffling without duplicates.
- Room code creation.
- Dealing 10 cards to each player.
- Four starting rows.
- Automatic row placement.
- Sixth-card row taking.
- Low-card row choice.
- Turn resolution order.
- Round scoring.
- Game-over detection at the score limit.
- Private state filtering so other players' hands are never sent.

Manual browser testing should cover:

- Host creates a room.
- A second browser joins.
- A third/fourth browser can join.
- Host starts game.
- Each player sees only their own hand.
- Players choose cards and see synced resolution.
- A low-card row choice works.
- The game reaches round end cleanly.
