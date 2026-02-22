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
- `APP_URL`
  - For **local dev**, NanoBanana cannot call `localhost`.
  - Use a public tunnel (e.g. ngrok) and set `APP_URL` to that public HTTPS URL.

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

UI lives in `src/app/page.tsx`.

## Notes

- Image editing mode (`IMAGETOIAMGE`) requires **publicly accessible** `imageUrl` (and callback URL).
- This MVP stores uploaded files under `public/uploads/`. For production, replace with S3/Cloudinary.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
