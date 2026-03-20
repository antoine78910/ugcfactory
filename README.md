## UGC Automation (NanoBanana + KIE) — MVP

Small Next.js app to automate:

- **prompt + product image → realistic UGC image** (NanoBanana)
- **generated image → short UGC video** (KIE: Veo 3.1 + Market models like Kling 3.0)

Docs used:
- [Generate or Edit Image](https://docs.nanobananaapi.ai/nanobanana-api/generate-or-edit-image)
- [Get Task Details](https://docs.nanobananaapi.ai/nanobanana-api/get-task-details.md)
- [Callbacks](https://docs.nanobananaapi.ai/nanobanana-api/generate-or-edit-image-callbacks.md)
- [KIE docs](https://docs.kie.ai/)

Architecture overview: `docs/ARCHITECTURE.md`

## Getting Started

### 1) Install

```bash
npm install
```

### 2) Configure environment variables

Create `.env.local` from `.env.example`:

```bash
copy .env.example .env.local
```

Set:

- `NANOBANANA_API_KEY` (server-only)
- `KIE_API_KEY` (server-only)
- `OPENAI_API_KEY` (server-only)
- `APP_URL`
  - For **local dev**, NanoBanana cannot call `localhost`.
  - Use a public tunnel (e.g. ngrok) and set `APP_URL` to that public HTTPS URL.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2b) Supabase setup (Auth + save history + GPT cache)

- Create a Supabase project
- In Supabase SQL editor, run `supabase/schema.sql`
- Enable Auth providers you want (Email / Magic link)

### 2c) Upload d’images en production (Vercel / serverless)

En local, les images sont enregistrées dans `public/uploads/`. Sur Vercel le disque est en lecture seule, il faut utiliser **Supabase Storage** :

1. Dans Supabase : **Storage** → **New bucket** → nom `ugc-uploads` → cocher **Public** (ou **Private** pour plus de sécurité) → Create.
2. Exécute `supabase/storage-policies.sql` dans le SQL Editor pour que chaque user n’accède qu’à son dossier (RLS Storage).
3. Dans ton projet : **Settings** → **API** → copie la clé **service_role** (secret).
4. Définis la variable d’environnement `SUPABASE_SERVICE_ROLE_KEY` (Vercel et/ou `.env.local`). Ne l’expose jamais côté client.

Une fois configuré, les packshots sont uploadés dans le bucket et tout reste sauvegardé par projet.

### 2d) Sessions et isolation des données

- Chaque utilisateur a **sa propre session** (Supabase Auth, cookie/JWT). Les données ne se mélangent pas.
- **Runs et cache GPT** : RLS en base garantit que chaque user ne voit que ses lignes (`user_id`). Les APIs filtrent aussi explicitement par `user_id`.
- **Storage** : les fichiers sont stockés sous `{user_id}/{filename}` ; les policies Storage limitent l’accès au dossier du user connecté.

### 3) Run the dev server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Shadcn CLI (`npx shadcn add …`)

Le projet Next.js est le dossier **`ugc-automation`** (pas le dossier parent `speel 2.0`). Sinon le CLI affiche *We could not detect a supported framework*.

```bash
cd ugc-automation
npx shadcn@latest add https://21st.dev/r/ibelick/text-shimmer --yes
```

UI lives in `src/app/page.tsx`.

## Notes

- Image editing mode (`IMAGETOIAMGE`) requires **publicly accessible** `imageUrl` (and callback URL).
- En local, les uploads vont dans `public/uploads/`. En production (ex. Vercel), configure Supabase Storage (bucket public `ugc-uploads` + `SUPABASE_SERVICE_ROLE_KEY`) pour que les packshots soient stockés et sauvegardés par projet.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
