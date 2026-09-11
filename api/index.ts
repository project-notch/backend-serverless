import type { VercelRequest, VercelResponse } from '@vercel/node';
import serverless from 'serverless-http';
import { createApp } from '../dist/create-app.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

let handlerPromise: Promise<Handler> | undefined;

function getHandler(): Promise<Handler> {
  if (!handlerPromise) {
    handlerPromise = createApp().then((app) => {
      const expressApp = app.getHttpAdapter().getInstance();
      return serverless(expressApp) as unknown as Handler;
    });
  }
  return handlerPromise;
}

export default async function (req: VercelRequest, res: VercelResponse) {
  const handler = await getHandler();
  return handler(req, res);
}
