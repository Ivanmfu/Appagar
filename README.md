This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

Before you begin, ensure you have:
- Node.js >= 18.17.0 < 23
- A Supabase account and project

## Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env.local
```

2. Fill in your Supabase credentials in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key

You can find these values in your Supabase project settings under API.

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

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

## Deploy

### GitHub Pages workflow

This repo ships with a `deploy.yml` workflow that builds the app with `next build` (static export) and publishes it to GitHub Pages. To avoid blank states in producción, recuerda configurar los siguientes secretos en `Settings → Secrets and variables → Actions`:

| Secret | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase (p. ej. `https://xxxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave `anon` obtenida en Supabase → Project Settings → API |

> **Importante:** cada vez que regeneres las claves en Supabase, actualiza estos secretos y vuelve a desplegar para evitar que las peticiones queden vacías en producción.

Para forzar un nuevo deploy basta con hacer un commit (aunque sea vacío) en `main` o lanzar el workflow manualmente desde la pestaña *Actions*.

> **Tip rápido:** si solo necesitas refrescar la página publicada después de rotar las claves, añade una nota temporal a este README, haz commit y borra el cambio después para mantener el historial limpio.

### Vercel (opcional)

La forma más sencilla de desplegar un proyecto Next.js sigue siendo [Vercel](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme). Consulta la [documentación oficial](https://nextjs.org/docs/app/building-your-application/deploying) si prefieres ese flujo.
