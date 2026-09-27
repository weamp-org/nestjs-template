import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const pinoConfig: Params = {
  // nestjs-pino defaults to `[{ path: '*', method: RequestMethod.ALL }]`. Nest
  // applies the global prefix, so the Express adapter registers `/api/v1/*`,
  // which path-to-regexp v8 (Express 5) rejects for having an unnamed wildcard.
  // It logs a legacy-route WARN and auto-converts on every boot. `{*path}` is
  // the optional named wildcard that conversion produces, stated explicitly.
  // Note the optional form: plain `*path` does not match `/api/v1/`.
  // Keep in sync with the LoggingMiddleware route in app.module.ts.
  forRoutes: ['{*path}'],
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
      ignore: (req) => req.url === '/api/v1/health',
    },
  },
};
