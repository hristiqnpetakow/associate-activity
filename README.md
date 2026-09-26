# Асоциации • Activity

Realtime multiplayer party game на български, изградено с Next.js 16, React, TypeScript, Tailwind CSS и Supabase.

## 1. Изисквания

- Node.js 22+
- Supabase проект
- Включен Anonymous Sign-Ins в Supabase Auth

Supabase поддържа anonymous sign-in, така че играчите не се регистрират с email.

## 2. Локален старт

```bash
npm install
cp .env.example .env.local
npm run dev
```

Попълни в `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

## 3. Supabase

1. Създай нов проект.
2. Отиди в Authentication → Providers и включи Anonymous Sign-Ins.
3. В SQL Editor изпълни `supabase/migrations/001_initial.sql`.
4. Провери, че таблиците `rooms`, `players` и `games` имат Realtime enabled.

## 4. Build

```bash
npm run typecheck
npm run build
npm start
```

## 5. Deploy

Препоръчително: Vercel.

Добави същите environment variables в Vercel. Supabase остава отделният realtime backend.

## 6. Архитектура

- `rooms` — lobby, host, код и настройки
- `players` — играчи, име, думи и ready state
- `games` — текущият атомарен game snapshot; Realtime subscription обновява всички клиенти
- Anonymous Auth — уникална сесия без регистрация
- PWA manifest — инсталация като web app

## Важно за production

Този MVP използва server-readable JSON game snapshot за бърза realtime синхронизация. За публично production приложение с конкурентна игра и anti-cheat изисквания се препоръчва game actions да се преместят в Postgres RPC/Edge Functions с optimistic concurrency / version checks.

## Team assignment update

For an existing Supabase project, run `supabase/migrations/002_team_assignment.sql` once in the Supabase SQL Editor. It adds manual team selection without changing the existing game tables.

The lobby now supports random or manual team assignment. In manual mode players can join the available teams before the host starts the game.

During a turn, only the explainer sees the current card and passed cards in the UI. When the timer ends, the game waits for the host to press **Следващ отбор**. When a round ends, it waits for **Следващ рунд**.
