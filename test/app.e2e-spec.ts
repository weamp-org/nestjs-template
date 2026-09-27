import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  // Regression guard for the ALL_ROUTES wildcard in src/logging/routes.ts.
  // LoggingMiddleware sets x-request-id, so the header's presence proves the
  // middleware matched. path-to-regexp v8 compiles the plain `*path` wildcard
  // to require a trailing slash before the wildcard, so a regression to `*path`
  // drops the header here while every other test still passes. `/api/v1/` is
  // used rather than the bare prefix root, which no form of the pattern matches.
  it('applies LoggingMiddleware to /api/v1/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/')
      .expect(200)
      .expect('x-request-id', /.+/);
  });

  afterEach(async () => {
    await app.close();
  });
});
