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
