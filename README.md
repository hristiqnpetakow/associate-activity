# Associations • Activity

A real-time multiplayer party game for groups, built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS**, and **Supabase**.

The application supports **Bulgarian and English**, with a language switcher available in the app header. Players can join without registering, using an anonymous Supabase Auth session.

## Features

- Real-time multiplayer rooms for 6–20+ players
- Room creation by host
- Join by room code, shareable link, or QR code
- Anonymous play — no email/password registration
- Team size selection: 2 or 3 players
- Random team assignment
- Free-form team formation where players can create and join named teams
- Twelve custom words per player:
  - 3 objects
  - 3 animals
  - 3 famous people
  - 3 professions
- Three game rounds:
  1. **Explain** — unlimited words, but no use of the word, root, or derived forms
  2. **One Word** — exactly one hint word, no sentences
  3. **Charades** — gestures and acting only
- One point per correctly guessed word
- Three active pass slots per turn, with a maximum of three passed cards
- Passed cards remain available throughout the turn
- Passed cards can be revisited at any time
- Guessing a passed card restores one available pass slot
- When all three pass slots are occupied, the main deck is locked until a passed card is guessed
- Manual host-controlled transition to the next team after time expires
- Manual host-controlled transition to the next round
- Remaining-time bonus for the same team on its first turn of the next round
- Server-timestamp-based countdown logic
- Pause/resume controlled by the host
- Active words are hidden from players who should not see them
- Reconnect and realtime synchronization
- Dark mode
- PWA support
- Game history
- Production-ready Vercel deployment

## Tech stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Database
- Supabase Anonymous Auth
- Supabase Realtime
- Vercel for hosting

## Requirements

- Node.js 22+
- A Supabase project
- Anonymous Sign-Ins enabled in Supabase Auth

## Local development

Clone the repository and install dependencies:

```bash
npm install
```

Create the local environment file:

```bash
cp .env.example .env.local
```

Set the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

To test on a phone on the same local network:

```bash
npm run dev -- --hostname 0.0.0.0
```

Then open the computer's local IP address on the phone, for example:

```text
http://192.168.1.10:3000
```

## Supabase setup

### 1. Create the project

Create a new project in Supabase.

### 2. Enable Anonymous Sign-Ins

In Supabase Authentication settings, enable **Anonymous Sign-Ins**.

Players do not need email or password accounts. Supabase still creates an authenticated session for each player.

### 3. Configure the Data API

Recommended settings for this project:

```text
Enable Data API: ON
Automatically expose new tables: OFF
Enable automatic RLS: ON
```

The project uses explicit grants and RLS policies rather than automatically exposing every new table.

### 4. Run the migrations

Run the SQL files in **Supabase → SQL Editor → New query**.

Run them in this order:

```text
supabase/migrations/001_initial.sql
supabase/migrations/002_team_assignment.sql
supabase/migrations/003_manual_room_teams.sql
```

Important: paste the **SQL content inside each file**, not the filename itself.

For an existing database, all three migrations may be required. The first migration creates the main tables. The second adds team assignment mode and player team selection. The third adds named room teams for free-form team creation.

### 5. Realtime

Realtime is used for:

- player changes
- room changes
- named team changes
- game state changes

The migrations add the required tables to the Supabase Realtime publication.

## Database structure

The core tables are:

### `rooms`

Stores:

- room code
- host user ID
- team size
- assignment mode
- room status
- linked game ID

### `players`

Stores:

- player name
- anonymous user ID
- host state
- ready state
- the player's 12 submitted words
- selected team ID in manual mode

### `games`

Stores the current game snapshot in `state`.

The snapshot contains:

- teams
- team order
- scores
- round
- current turn
- current card
- main deck
- passed cards
- pass availability
- timer timestamps
- bonus time
- game status

### `room_teams`

Stores named teams created in the lobby when **Free team formation** is selected.

## Game flow

### Lobby

The host creates a room and chooses:

- team size: 2 or 3
- random assignment or free team formation

Players join by code/link/QR and submit their 12 words.

### Random teams

Players are shuffled and distributed as evenly as possible.

### Free team formation

Players can:

1. create a named team;
2. join an existing team;
3. leave their current team;
4. choose another team before the game starts.

The host can start only when the teams are valid and balanced.

## Round and turn rules

Each turn starts with **3 available pass slots**.

A normal pass:

- moves the current card into the passed-card list;
- consumes one pass slot;
- allows another main-deck card while an available pass slot remains.

The passed-card list is limited to **3 cards**.

A passed card can be selected again at any time.

When a passed card is selected:

- if the team still has an available pass slot, it may choose **New Word** without consuming another pass;
- if all 3 pass slots are occupied, the team cannot draw from the main deck;
- the team must guess one of the passed cards;
- when a passed card is guessed, it is removed and one pass slot is restored.

This means the pass system always has a maximum of three active passed cards and three available pass slots.

## Time bonus rule

If the final remaining cards are guessed before a team's turn timer reaches zero, the remaining seconds are stored as a bonus for that same team.

Example:

```text
5 cards remain
Team A starts with 60 seconds
Team A guesses all 5 cards in 25 seconds
35 seconds remain
```

The next round starts with:

```text
Team A: 95 seconds on its first turn
All later turns: 60 seconds
```

The bonus:

- belongs only to that team;
- is used only on that team's first turn of the next round;
- is not shared with other teams;
- is not carried over again after being used.

## Visibility rules

During an active turn, the current word and passed words are visible only to the **explainer** of the playing team.

Other members of the playing team and all other teams see a hidden-card state instead.

This is currently enforced in the client UI. For a high-security public deployment, sensitive game actions should be moved to server-side RPC/Edge Functions so that secret card data is never sent to unauthorized clients.

## Language switching

The UI supports:

- Bulgarian (`БГ`)
- English (`EN`)

The language selector is available in the top-right app header.

The selection is stored in browser local storage and restored on the next visit.

## Deployment with Vercel

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Add these production environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

4. Deploy the project.

Vercel automatically creates a new deployment after each push to the tracked production branch.

For local Vercel CLI usage:

```bash
npx vercel@latest login
npx vercel@latest link
npx vercel@latest env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel@latest env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel@latest --prod
```

## Useful commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm start
```

## Project structure

```text
app/
  create/
  game/
  history/
  join/
  results/
  room/
components/
lib/
supabase/
  migrations/
public/
```

Important responsibilities:

- `app/` — pages and game screens
- `components/` — reusable UI components
- `lib/i18n.tsx` — Bulgarian/English translations and language state
- `lib/state.ts` — game-state and team logic
- `lib/repo.ts` — Supabase data access
- `lib/auth.ts` — anonymous session handling
- `lib/types.ts` — shared TypeScript types
- `supabase/migrations/` — database schema and RLS changes

## Security notes

The project uses Supabase RLS and explicit `authenticated` grants.

The publishable Supabase key is safe to use in the browser when RLS is configured correctly. Never expose a Supabase service-role or secret key through a `NEXT_PUBLIC_*` variable.

The current game implementation stores the synchronized game state as a JSON snapshot in the `games.state` column. This keeps realtime synchronization simple for a small private party game. A larger public deployment should use server-authoritative actions, concurrency/version checks, and server-side validation for scoring and card visibility.
