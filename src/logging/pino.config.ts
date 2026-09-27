import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { ALL_ROUTES } from './routes.js';

const isProduction = process.env.NODE_ENV === 'production';

export const pinoConfig: Params = {
  // nestjs-pino defaults to `[{ path: '*', method: RequestMethod.ALL }]`. Nest
  // applies the global prefix, so the Express adapter registers `/api/v1/*`,
  // which path-to-regexp v8 (Express 5) rejects for having an unnamed wildcard.
  // It logs a legacy-route WARN and auto-converts on every boot. ALL_ROUTES is
  // the optional named wildcard that conversion produces, stated explicitly.
  forRoutes: [ALL_ROUTES],
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: false },
        },
    genReqId(req) {
      const header = req.headers['x-request-id'];
      const id =
        typeof header === 'string' && header.trim() !== ''
          ? header
          : randomUUID();
      req.headers['x-request-id'] = id;
      return id;
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(request: IncomingMessage & { id?: string | number }) {
        return {
          id: request.id,
          method: request.method,
          url: request.url,
        };
      },
      res(response: ServerResponse & { statusCode?: number }) {
        return {
          statusCode: response.statusCode,
        };
      },
      err(error: Error & { constructor?: { name?: string } }) {
        return {
          type: error.constructor?.name ?? 'Error',
          message: error.message,
          stack: error.stack,
        };
      },
    },
    autoLogging: {
      // The health check is the global prefix root, `GET /api/v1`, handled by
      // AppController's bare `@Get()`. Both spellings are listed because Express
      // matches `/api/v1/` to the same route.
      //
      // This reads `originalUrl`, not `url`. Express strips the matched mount
      // prefix from `url`, so inside middleware mounted on `/api/v1/{*path}`
      // the health check reports `url === '/'` and every other route reports
      // `/users`, `/webhooks/...` and so on. `originalUrl` is the untouched
      // request path. The previous `req.url === '/api/v1/health'` could never
      // match: that route does not exist, and `url` would not have held that
      // value here either. The query string is stripped since uptime probes
      // often append one.
      ignore: (req) => {
        const { originalUrl = '' } = req as IncomingMessage & {
          originalUrl?: string;
        };
        const [pathname] = originalUrl.split('?');
        return pathname === '/api/v1' || pathname === '/api/v1/';
      },
    },
  },
};
