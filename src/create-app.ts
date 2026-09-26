import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

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

  const config = new DocumentBuilder()
    .setTitle('Project Nutian API')
    .setDescription('Bill & recurring-payment detection — backend API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.init();

  return app;
}
