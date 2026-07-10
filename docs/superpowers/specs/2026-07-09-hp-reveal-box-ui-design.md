# HP, Reveal, and Box-Style UI Design

## Goal

Change the game from penalty-score accumulation to HP survival, add a visible card reveal step before placement, make row danger easier to read, and restyle the interface with a bright board-game-box feel inspired by the user's reference image without copying official logos or artwork.

## Rules

- Starting HP defaults to `66`.
- The host can change starting HP in the lobby before starting the game.
- Players lose HP immediately when they take penalty cards.
- HP loss equals the total bulls on the taken cards.
- The game ends as soon as any player reaches `0 HP` or below.
- The winner is the player with the highest HP remaining.

## Turn Flow

- Players choose cards privately during `choosing`.
- When all players have chosen, the room enters `reveal`.
- The reveal view shows chosen cards sorted by card value from low to high, with each owner's name above their card.
- The host presses `Resolve Cards` to place the revealed cards in order.
- Row-choice behavior stays the same, but HP damage applies when the row is taken.

## Table UI

- Each row shows five fixed slots.
- Occupied slots contain cards.
- Empty slots show faint placeholders.
- The fifth slot is visually marked as the danger slot.
- Row penalty text changes from score/bulls wording to HP damage wording.

## Visual Style

- The UI uses a yellow box-cover background with repeated purple bull-head marks.
- Main surfaces use bold red, purple, blue, green, and white accents.
- The title treatment is chunky, playful, and outlined, but remains code-native text.
- The style is inspired by the supplied board-game box image, not a copy of the official 6 nimmt!/AMIGO assets.
