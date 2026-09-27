/**
 * Wildcard route pattern for middleware that must cover every route.
 *
 * `{*path}` is the path-to-regexp v8 optional named wildcard. The braces
 * matter: plain `*path` compiles to a pattern that requires a trailing slash
 * before the wildcard, so `/api/v1/` would silently fall through the
 * middleware. Both nestjs-pino's `forRoutes` and the LoggingMiddleware route
 * read this constant so the two cannot drift apart.
 *
 * Neither form matches the bare global prefix root (`/api/v1`). That is a
 * pre-existing Nest limitation — `forRoutes` always prepends the global
 * prefix, so no argument can bind a middleware to exactly the prefix.
 */
export const ALL_ROUTES = '{*path}';
