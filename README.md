# v0-stabilityscope-frontend-build

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_IZ3Jex8hWO0vy6iuJCLi4IQU5oYt)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Trade-offs

- **Limited to DOW 30 companies due to Tiingo free tier constraints.** The
  fundamentals endpoint (`/tiingo/fundamentals/<ticker>/statements`) only
  returns data for the DOW 30 on the free plan, so the ticker search and the
  `POST /api/score` endpoint reject anything outside that list. **Production
  would use FMP or a paid Tiingo plan for full market coverage.** The
  authoritative list lives in `lib/dow30.ts`.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

<a href="https://v0.app/chat/api/kiro/clone/AdityaSharma2168/v0-stabilityscope-frontend-build" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>
