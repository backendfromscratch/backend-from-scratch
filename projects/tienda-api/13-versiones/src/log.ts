// Los logs, en JSON: una línea por suceso, que una persona puede leer y un programa también.
import { pino } from 'pino';
import { config } from './config.ts';

export const log = pino({ level: config.LOG_LEVEL });
