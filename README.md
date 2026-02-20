This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Video Runtime Architecture

The app now includes modular video chat servers and an admin monitoring dashboard:

- `GET/POST /api/video/servers`: list and create video server modules.
- `GET/POST /api/video/match`: distributed queue + match state per server module.
- `GET/POST /api/video/signal`: WebRTC signaling relay (offer/answer/ICE).
- `GET /api/admin/video/overview`: global management metrics across all servers.
- UI routes:
  - `/video` for end-user random cam chat.
  - `/admin/video` for admin monitoring.

State is persisted via Prisma models (`VideoServer`, `VideoQueueEntry`, `VideoSession`, `VideoSignal`) so multiple app runtimes can coordinate through a shared database.

For production horizontal scaling, use a shared production database (typically Postgres) for all runtimes.

### Admin Access

Set `ADMIN_EMAILS` (comma-separated) in `.env` to grant dashboard access and auto-assign admin role on registration.

## Getting Started

First, run the development server:

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
