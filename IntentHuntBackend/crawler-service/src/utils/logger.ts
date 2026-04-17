import pino from 'pino';
import { env } from '../config/env.js';

const opts: pino.LoggerOptions = { level: env.LOG_LEVEL };

if (env.NODE_ENV !== 'production') {
  opts.transport = { target: 'pino-pretty', options: { colorize: true } };
}

export const logger = pino(opts);
