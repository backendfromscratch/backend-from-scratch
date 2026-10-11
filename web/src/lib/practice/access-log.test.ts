import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOT_IP, generateAccessLog, INCIDENT_HOUR, OFFICE_IP, SCANNER_IP } from './access-log';

const log = generateAccessLog();
const lines = log.trimEnd().split('\n');

// nginx's "combined" format: ip - - [date] "METHOD path PROTOCOL" status bytes "referer" "user agent"
const COMBINED =
  /^(\d+\.\d+\.\d+\.\d+) - - \[(\d\d)\/Oct\/2026:(\d\d):(\d\d):(\d\d) \+0000\] "(GET|POST) (\/\S*) HTTP\/(1\.1|2\.0)" (\d{3}) (\d+) "([^"]*)" "([^"]+)"$/;

/** The fields the lessons cut with `cut -d' '` and `cut -d:`. */
const parsed = lines.map((line) => {
  const fields = line.split(' ');
  return { line, ip: fields[0], path: fields[6], status: fields[8], hour: line.split(':')[1] };
});

const countBy = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
};

describe('generateAccessLog', () => {
  it('always generates the same file', () => {
    expect(generateAccessLog()).toBe(log);
  });

  it('matches the file the site serves (regenerate it with `pnpm --filter web practice:log`)', () => {
    const served = readFileSync(
      new URL('../../../public/practicas/access.log', import.meta.url),
      'utf8',
    );
    expect(served).toBe(log);
  });

  it('has about a thousand lines, ending with a newline', () => {
    expect(lines.length).toBeGreaterThanOrEqual(950);
    expect(lines.length).toBeLessThanOrEqual(1100);
    expect(log.endsWith('\n')).toBe(true);
  });

  it('writes every line in the combined format, on the same day', () => {
    for (const line of lines) {
      const match = COMBINED.exec(line);
      expect(match, line).not.toBeNull();
      expect(match?.[2]).toBe('01');
    }
  });

  it('is in chronological order', () => {
    const times = lines.map((line) => COMBINED.exec(line)!.slice(3, 6).join(':'));
    expect(times).toEqual([...times].sort());
  });

  it('only uses IPs from the documentation ranges (RFC 5737)', () => {
    for (const { ip } of parsed) {
      expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/);
      expect(Number(ip.split('.')[3])).toBeLessThanOrEqual(254);
    }
  });

  it('keeps the status in field 9 and the hour in field 2 after the first colon', () => {
    for (const { line, status, hour } of parsed) {
      const match = COMBINED.exec(line)!;
      expect(status).toBe(match[9]);
      expect(hour).toBe(match[3]);
    }
  });

  it('has 200, 301, 404 and 500, and nothing else', () => {
    const statuses = countBy(parsed.map((entry) => entry.status));
    expect(statuses.map(([status]) => status).sort()).toEqual(['200', '301', '404', '500']);
    expect(statuses[0][0]).toBe('200');
    for (const [, count] of statuses) expect(count).toBeGreaterThanOrEqual(15);
  });

  it('every redirect is followed by the request to its new address', () => {
    parsed.forEach((entry, index) => {
      if (entry.status !== '301') return;
      const next = parsed.slice(index + 1).find((later) => later.ip === entry.ip);
      expect(next?.status, entry.line).toBe('200');
    });
  });

  // The stories lessons 2 and 3 tell with this log.

  it('the IP with the most requests is the bot, then the office, then the scanner', () => {
    const top = countBy(parsed.map((entry) => entry.ip)).slice(0, 3);
    expect(top.map(([ip]) => ip)).toEqual([BOT_IP, OFFICE_IP, SCANNER_IP]);
    expect(top[2][1]).toBeGreaterThan(countBy(parsed.map((entry) => entry.ip))[3][1]);
  });

  it('the scanner only gets 404s, all in a few minutes before dawn', () => {
    const scanner = parsed.filter((entry) => entry.ip === SCANNER_IP);
    expect(scanner.every((entry) => entry.status === '404')).toBe(true);
    expect(new Set(scanner.map((entry) => entry.hour))).toEqual(new Set(['03']));
  });

  it('every 500 happens in the same hour, in the API', () => {
    const errors = parsed.filter((entry) => entry.status === '500');
    expect(new Set(errors.map((entry) => entry.hour))).toEqual(new Set([INCIDENT_HOUR]));
    expect(errors.every((entry) => entry.path.startsWith('/api/'))).toBe(true);
  });

  it('the office only visits during working hours', () => {
    const hours = parsed.filter((entry) => entry.ip === OFFICE_IP).map((entry) => entry.hour);
    expect(hours.every((hour) => hour >= '09' && hour <= '17')).toBe(true);
  });

  it('there is traffic every hour, more by day than by night', () => {
    const perHour = new Map(countBy(parsed.map((entry) => entry.hour)));
    expect(perHour.size).toBe(24);
    expect(perHour.get('19')!).toBeGreaterThan(perHour.get('04')! * 3);
  });
});
