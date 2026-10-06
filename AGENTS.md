# Agent / contributor notes

- **UI copy**: All user-facing strings in the app (labels, toasts, dialogs, placeholders, errors) should be **English**.
- **Comments**: Prefer English in code comments for consistency.

## Cursor Cloud specific instructions

- Dependencies: `npm ci` (Node.js 22, `package-lock.json`). Dev server: `npm run dev -- --hostname 0.0.0.0 --port 3000` (the `dev` script already uses webpack). Production build: `npm run build`.
- There is no `test` script. Run unit tests with `node --import tsx --test` on `src/**/*.test.ts` and `src/**/*.test.mts`.
- `src/proxy.ts` treats `localhost` as the studio host, so `/` rewrites into the authenticated app and errors until `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set (see `.env.example`; `.env.local` is gitignored). These routes work without those secrets: `/clipping`, `/clipping/tools`, `/workflow` (local workflows are stored in the browser).
- Authenticated studio, billing, and generation also need the matching secrets from `.env.example` (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `KIE_API_KEY`, `STRIPE_SECRET_KEY`, and others). Do not commit them.
