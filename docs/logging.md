# Logging

## Overview

Logging is split across three files in `src/logging/`. Two are middleware
registered through Nest's `configure()`, and one is configuration.

| File                    | Role                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `routes.ts`             | Exports `ALL_ROUTES`, the wildcard both middlewares are mounted on               |
| `pino.config.ts`        | `nestjs-pino` options: level, redaction, serializers, request IDs, `autoLogging` |
| `logging.middleware.ts` | Copies the request ID onto the `x-request-id` response header                    |

Both middlewares read `ALL_ROUTES` so they cannot drift apart. A wildcard is
involved because Nest prefixes the string you pass to `forRoutes()` with the
global prefix.

---

## `ALL_ROUTES` must be `{*path}`, not `*path`

```ts
export const ALL_ROUTES = '{*path}';
```

Express 5 uses `path-to-regexp` v8, which dropped the unnamed `*`, `?`, and `+`
wildcards. Nest's `LegacyRouteConverter` patches over this at startup by logging
a warning and rewriting the pattern — so a bare `*` works, but noisily:

```
WARN: Unsupported route path: "/api/v1/*" ... Attempting to auto-convert to "/api/v1/{*path}"...
```

Stating the pattern explicitly silences the warning.

**The braces are not optional.** Nest mounts the middleware on
`/api/v1/{*path}`, and v8 compiles the two patterns differently:

| Pattern   | Compiles to                                    | Matches `/api/v1/` |
| --------- | ---------------------------------------------- | ------------------ |
| `*path`   | `^(?:\/api\/v1\/([^]+))(?:\/$)?$`              | no                 |
| `{*path}` | `^(?:\/api\/v1\/([^]+)\|\/api\/v1\/)(?:\/$)?$` | yes                |

`nestjs-pino` defaults to `forRoutes: [{ path: '*', method: RequestMethod.ALL }]`
when you do not set it, so the override is required in `pinoConfig`.

`test/app.e2e-spec.ts` guards this: it asserts `GET /api/v1/` returns an
`x-request-id` header, which is only true if `LoggingMiddleware` matched the
request.

---

## `req.url` is mount-relative; use `originalUrl`

This is the subtle one. Express strips the matched mount prefix from `req.url`
before handing off to the mounted handler, so **inside middleware, `req.url` is
relative to where the middleware was mounted** — not the full path the client
requested.

With both middlewares mounted on `/api/v1/{*path}`:

| Request                 | `req.url` | `req.originalUrl`   |
| ----------------------- | --------- | ------------------- |
| `GET /api/v1/`          | `/`       | `/api/v1/`          |
| `GET /api/v1/users`     | `/users`  | `/api/v1/users`     |
| `GET /api/v1/users?x=1` | `/?x=1`   | `/api/v1/users?x=1` |

Any predicate that matches on the request path — `autoLogging.ignore`,
`LoggerModule`'s `exclude`, or your own — must read `originalUrl`.

This bit us: `autoLogging.ignore` compared `req.url === '/api/v1/health'`, a
route that does not exist, and even had it existed, `req.url` would not have held
that value inside the mounted middleware. It matched nothing, silently. `pino.config.ts`
now reads `originalUrl` and matches the real health route.

```ts
ignore: (req) => {
  const { originalUrl = '' } = req as IncomingMessage & {
    originalUrl?: string;
  };
  const [pathname] = originalUrl.split('?');
  return pathname === '/api/v1' || pathname === '/api/v1/';
};
```

---

## The health check is not logged, by design

`AppController` has a bare `@Get()` under the global prefix, so the health check
is the prefix root: `GET /api/v1`. It is excluded from logs by `autoLogging.ignore`
above, which is why health-probe traffic will not appear in the log stream.

Both spellings are listed because Express matches `/api/v1/` to the same route,
and the query string is stripped because uptime probes often append one.

---

## Known limitation: the bare prefix root bypasses both middlewares

`GET /api/v1` — no trailing slash — is **not** reached by either middleware, so
it produces no log line and no `x-request-id` header.

This is a Nest limitation rather than a mistake in the pattern. `forRoutes()`
always prepends the global prefix, so no argument can bind a middleware to
exactly `/api/v1`. Nest does emit an extra `/api/v1$` path for wildcard routes,
but `$` is a literal character in a path pattern, so it matches a URL ending in a
dollar sign and nothing else.

Closing this would mean mounting both middlewares with `app.use()` in `main.ts`,
moving them off Nest's middleware system and losing DI-managed registration. The
only symptom is a missing correlation header on a liveness probe, so the cost
outweighs the benefit. Revisit only if someone needs it.

---

## Verifying a change here

Route matching is not observable from unit tests, and a wrong wildcard still
passes the whole suite. Check it against a running server:

```bash
pnpm build
PORT=3999 node dist/src/main.js &
sleep 5
curl -s -o /dev/null "http://localhost:3999/api/v1/"
curl -s -o /dev/null "http://localhost:3999/api/v1/users"
curl -s -D - -o /dev/null "http://localhost:3999/api/v1/users" | grep -i x-request-id
kill %1
```

Then confirm in the server's stdout:

- `GET /api/v1/` produces no log line (health check, excluded by design)
- `GET /api/v1/users` produces one `request completed` line and an `x-request-id` header
- no `Unsupported route path` warning appeared during startup
