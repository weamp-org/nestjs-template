import { MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ClerkAuthGuard } from './clerk-auth/clerk-auth.guard.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { LoggingMiddleware } from './logging/logging.middleware.js';
import { pinoConfig } from './logging/pino.config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    LoggerModule.forRoot(pinoConfig),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute
        limit: 100, // 100 requests per minute for general endpoints
        getTracker: (req: { user: { id: string }; ip: string }) =>
          req.user?.id ?? req.ip,
      },
    ]),
    PrismaModule,
    UsersModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ClerkAuthGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // `{*path}` is the path-to-regexp v8 optional wildcard. Plain `*path` would
    // skip `/api/v1/`, dropping the x-request-id header on those requests.
    consumer.apply(LoggingMiddleware).forRoutes('{*path}');
  }
}
