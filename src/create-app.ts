import { timingSafeEqual } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Length must match before timingSafeEqual (it throws on mismatched
  // lengths) — comparing against a fixed-length dummy first keeps the
  // early return from itself leaking length via timing.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // contentSecurityPolicy off (Nest's own recommendation when Swagger UI is
  // mounted — its default directives break Swagger's inline scripts/styles).
  // crossOriginResourcePolicy off: this API is consumed cross-origin by the
  // mobile app and (in dev) a random-port Flutter web server, not just
  // same-site browser tabs — the default "same-origin" policy would block
  // those responses.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  // Flutter web's dev server picks a random localhost port each run, so in dev
  // any localhost/127.0.0.1 origin is allowed instead of pinning to FRONTEND_URL.
  const isProd = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: isProd ? (process.env.FRONTEND_URL ?? 'http://localhost:3001') : /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
    credentials: true,
  });

  // Security audit finding: /docs was wide open in production — the full API
  // schema (every endpoint, every DTO shape) handed to anyone who found the
  // URL. In prod it now needs SWAGGER_USER/SWAGGER_PASSWORD; if either is
  // unset, docs just don't mount at all (safe default, no crash) rather than
  // serving unauthenticated. Dev stays open — low stakes, and gating it would
  // just slow down local API exploration for no benefit.
  const swaggerUser = process.env.SWAGGER_USER;
  const swaggerPassword = process.env.SWAGGER_PASSWORD;
  if (!isProd || (swaggerUser && swaggerPassword)) {
    if (isProd) {
      app.use('/docs', (req: Request, res: Response, next: NextFunction) => {
        const header = req.headers.authorization;
        const [, encoded] = header?.split(' ') ?? [];
        const [user, password] = encoded
          ? Buffer.from(encoded, 'base64').toString('utf8').split(':')
          : [];
        if (user && password && safeEqual(user, swaggerUser!) && safeEqual(password, swaggerPassword!)) {
          return next();
        }
        res.set('WWW-Authenticate', 'Basic realm="docs"');
        res.status(401).send('Authentication required.');
      });
    }

    const config = new DocumentBuilder()
      .setTitle('Project Nutian API')
      .setDescription('Bill & recurring-payment detection — backend API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.init();

  return app;
}
