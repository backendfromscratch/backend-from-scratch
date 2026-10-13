// The logs, in JSON: one line per event, which a person can read and so can a program.
import { pino } from 'pino';
import { config } from './config.ts';

export const log = pino({ level: config.LOG_LEVEL });
