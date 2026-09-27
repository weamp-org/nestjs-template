# Deployment

## Prerequisites

- Node.js 24+
- pnpm 11.2.2
- A PostgreSQL database (see [prisma.md](prisma.md) for connection details)
- A Clerk application with API keys configured

---

## Environment checklist

Ensure these variables are set in production:

| Variable                       | Required | Notes                                   |
| ------------------------------ | -------- | --------------------------------------- |
| `DATABASE_URL`                 | Yes      | Production PostgreSQL connection string |
| `CLERK_PUBLISHABLE_KEY`        | Yes      | From Clerk Dashboard → API Keys         |
| `CLERK_SECRET_KEY`             | Yes      | From Clerk Dashboard → API Keys         |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Yes\*    | Required only if using Clerk webhooks   |
| `FRONTEND_BASE_URL`            | Yes      | Your frontend domain (CORS origin)      |
| `PORT`                         | No       | Defaults to `3000`                      |
| `NODE_ENV`                     | No       | Set to `production` to disable Swagger  |

\* Only needed if you use Clerk webhooks. Without it, the webhook endpoint will reject requests with signature verification errors.

---

## Build and run

Prisma CLI and the Nest build tooling live in `devDependencies`, so the build
pipeline needs a full install (not a production-only install):

```bash
# 1. Install dependencies (includes Prisma CLI and Nest CLI)
pnpm install --frozen-lockfile

# 2. Apply database migrations
pnpm prisma migrate deploy

# 3. Generate Prisma client
pnpm prisma generate

# 4. Build the application
pnpm build

# 5. Start the server (set NODE_ENV=production in the process environment)
pnpm start:prod
```

If you ship a prebuilt `dist/` (and already-generated Prisma client) into a
runtime-only image, you can then install production dependencies only with
`pnpm install --frozen-lockfile --prod`. Do not use `--prod` before
`prisma generate` or `pnpm build` in this template.

---

## Platform notes

This template is **platform-agnostic**. It compiles to plain JavaScript in `dist/` and runs as a standard Node.js process. Deploy anywhere that supports Node.js 24:

- **Railway / Render / Fly.io** — Set build command to `pnpm build` and start command to `pnpm start:prod`
- **AWS ECS / Fargate** — Build into a Docker image, set entrypoint to `node dist/src/main`
- **Kubernetes** — Standard deployment with env vars from secrets
- **VPS** — Use `pm2` or `systemd` to manage the process

### Docker

The repository includes `compose.yaml` for local development. For production, build a minimal Docker image:

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN pnpm prisma generate
COPY dist ./dist
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/src/main"]
```

---

## Health check

```http
GET /api/v1
```

Returns `200 OK` with `Hello World!`. Use this as your health check endpoint.

---

## Production checklist

- [ ] `NODE_ENV=production` set (disables Swagger UI)
- [ ] Database migrations have been applied
- [ ] Clerk webhook endpoint is configured in Clerk Dashboard
- [ ] CORS origin (`FRONTEND_BASE_URL`) points to your production frontend
- [ ] Secrets are stored securely (not in the codebase)
- [ ] PostgreSQL connection uses SSL if required by your provider
- [ ] Logs are captured (stdout) by your infrastructure
