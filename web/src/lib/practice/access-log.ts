/**
 * The practice web server log for Phase 1 (lessons 2 and 3): one day of an invented shop at
 * example.com, in nginx's "combined" format. It is generated with a fixed seed, so it is always the
 * same file: the lessons can show real counts. `scripts/generate-access-log.ts` writes it to
 * `public/practicas/access.log`.
 *
 * Besides ordinary visits, it hides the stories the lessons ask the reader to find:
 * - a bot crawling all day, the IP with the most requests;
 * - an office whose employees share one IP, only during working hours;
 * - a scanner looking for known vulnerable files before dawn, all 404s;
 * - an incident: for twenty minutes the API answers 500 and people retry their orders.
 *
 * Only IPv4 addresses from the documentation ranges (RFC 5737): they belong to nobody, and having no
 * colons, `cut -d: -f2` gives the hour on every line.
 */

export const BOT_IP = '203.0.113.50';
export const OFFICE_IP = '192.0.2.10';
export const SCANNER_IP = '198.51.100.23';
export const INCIDENT_HOUR = '14';

const SITE = 'https://example.com';
const DAY = '01/Oct/2026';
const SEED = 20261001;
const VISITOR_LINES = 760;

/** Relative traffic per hour (0 to 23, UTC): quiet at night, peaks at midday and in the evening. */
const HOURLY_TRAFFIC = [
  3, 2, 1, 1, 1, 1, 2, 4, 7, 9, 10, 10, 9, 8, 8, 7, 7, 9, 11, 12, 11, 9, 6, 4,
];

/** The incident, in seconds since midnight: from 14:05 to 14:25. */
const INCIDENT = { from: 14 * 3600 + 5 * 60, to: 14 * 3600 + 25 * 60 };

const BROWSERS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
];
const BOT_AGENT = 'ExampleBot/1.0 (+https://example.com/bot)';
const SCANNER_AGENT = 'python-requests/2.32.3';

const PRODUCTS = 40;
const BLOG_POSTS = ['first-order', 'choosing-a-size', 'shipping-times', 'gift-ideas'];
const ASSETS = ['/static/styles.css', '/static/app.js', '/favicon.ico'];
/** Old addresses that now redirect (301) to their new one. */
const MOVED: Record<string, string> = { '/shop': '/products', '/about-us': '/about' };
/** Addresses that do not exist: typos, removed products and old links. */
const NOT_FOUND = ['/prodcuts', '/products/41', '/products/57', '/blgo', '/contact', '/cart/old'];
/** What vulnerability scanners usually try: none of it exists on this site. */
const SCANNED = [
  '/.env',
  '/.env.backup',
  '/.git/config',
  '/.git/HEAD',
  '/wp-login.php',
  '/wp-admin/',
  '/xmlrpc.php',
  '/wp-config.php.bak',
  '/admin.php',
  '/administrator/',
  '/phpmyadmin/',
  '/pma/',
  '/config.json',
  '/backup.zip',
  '/backup.sql',
  '/db.sql',
  '/.aws/credentials',
  '/server-status',
  '/.DS_Store',
  '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
];

interface Entry {
  /** Seconds since midnight. */
  time: number;
  ip: string;
  method: 'GET' | 'POST';
  path: string;
  protocol: 'HTTP/1.1' | 'HTTP/2.0';
  status: 200 | 301 | 404 | 500;
  referer: string;
  agent: string;
}

/** mulberry32: a small pseudorandom generator with a seed. Same seed, same numbers. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Response size in bytes. The same path always weighs the same, as on a real server. */
function bytes(entry: Entry): number {
  if (entry.status === 301) return 169;
  if (entry.status === 404) return 153;
  if (entry.status === 500) return 177;
  if (entry.method === 'POST') return 64;
  let hash = 0;
  for (const char of entry.path) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  if (entry.path.startsWith('/static/')) return 18_000 + (hash % 40_000);
  if (entry.path.startsWith('/api/')) return 900 + (hash % 3_000);
  if (entry.path === '/favicon.ico') return 4_286;
  return 4_000 + (hash % 9_000);
}

function clock(time: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(time / 3600))}:${pad(Math.floor(time / 60) % 60)}:${pad(time % 60)}`;
}

function format(entry: Entry): string {
  const request = `${entry.method} ${entry.path} ${entry.protocol}`;
  return `${entry.ip} - - [${DAY}:${clock(entry.time)} +0000] "${request}" ${entry.status} ${bytes(entry)} "${entry.referer}" "${entry.agent}"`;
}

export function generateAccessLog(): string {
  const rand = random(SEED);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const hourTotal = HOURLY_TRAFFIC.reduce((sum, weight) => sum + weight, 0);
  const randomHour = () => {
    let left = rand() * hourTotal;
    return HOURLY_TRAFFIC.findIndex((weight) => (left -= weight) < 0);
  };
  const inIncident = (time: number) => time >= INCIDENT.from && time < INCIDENT.to;
  const product = () => `/products/${between(1, PRODUCTS)}`;

  // Visitors' IPs: unique, never one of the special ones. Raising the random number to 1.5 makes the first
  // ones in the list return more often, as regular customers do.
  const special = [BOT_IP, OFFICE_IP, SCANNER_IP];
  const visitors = new Set<string>();
  while (visitors.size < 120) {
    const ip = `${pick(['192.0.2', '198.51.100', '203.0.113'])}.${between(1, 254)}`;
    if (!special.includes(ip)) visitors.add(ip);
  }
  const regulars = [...visitors];
  const visitorIp = () => regulars[Math.floor(rand() ** 1.5 * regulars.length)];

  const entries: Entry[] = [];
  const browser = (time: number, ip: string, agent: string) => {
    const add = (
      path: string,
      status: Entry['status'],
      referer = '-',
      method: Entry['method'] = 'GET',
    ) => entries.push({ time, ip, method, path, protocol: 'HTTP/2.0', status, referer, agent });
    return { add };
  };

  /** A visit: an entry page, its files and a few more pages, a while apart. */
  const visit = (start: number, ip: string, agent: string) => {
    let time = start;
    let referer = '-';
    const pages = between(1, 4);
    for (let page = 0; page < pages && time < 86_400; page++) {
      const { add } = browser(time, ip, agent);
      const roll = rand();
      let path: string;
      if (roll < 0.08) {
        // An old link: 301 and, in the same second, the new address.
        const old = pick(Object.keys(MOVED));
        add(old, 301, referer);
        path = MOVED[old];
      } else if (roll < 0.13) {
        add(pick(NOT_FOUND), 404, referer);
        break;
      } else if (page === 0) {
        path = pick([
          '/',
          '/',
          '/',
          '/products',
          product(),
          product(),
          `/blog/${pick(BLOG_POSTS)}`,
        ]);
      } else {
        path = pick(['/products', product(), product(), '/cart', '/cart', '/about', '/blog']);
      }
      add(path, 200, referer);
      const url = `${SITE}${path}`;
      if (page === 0) for (const asset of ASSETS) add(asset, 200, url);
      if (path === '/products')
        add(`/api/products?page=${between(1, 3)}`, inIncident(time) ? 500 : 200, url);
      if (path === '/cart' && rand() < 0.3)
        add('/api/orders', inIncident(time) ? 500 : 200, url, 'POST');
      referer = url;
      time += between(5, 90);
    }
  };

  while (entries.length < VISITOR_LINES) {
    const start = randomHour() * 3600 + between(0, 3599);
    const hour = Math.floor(start / 3600);
    const atOffice = hour >= 9 && hour <= 16 && rand() < 0.3;
    visit(start, atOffice ? OFFICE_IP : visitorIp(), pick(BROWSERS));
  }
  // Visits that ran past midnight belong to the next day's log.
  const today = entries.filter((entry) => entry.time < 86_400);
  entries.length = 0;
  entries.push(...today);

  // The incident: customers whose order failed try again, sometimes more than once.
  for (let retry = 0; retry < 24; retry++) {
    const time = between(INCIDENT.from, INCIDENT.to - 1);
    browser(time, visitorIp(), pick(BROWSERS)).add('/api/orders', 500, `${SITE}/cart`, 'POST');
  }

  // The bot: every ten minutes, one page of the site, in order. It does not load the CSS or the JS.
  const crawl = ['/robots.txt', '/sitemap.xml', '/', '/products', '/about', '/blog'];
  for (let id = 1; id <= PRODUCTS; id++) crawl.push(`/products/${id}`);
  for (const post of BLOG_POSTS) crawl.push(`/blog/${post}`);
  crawl.push('/products/41');
  for (let slot = 0; slot < 144; slot++) {
    const path = crawl[slot % crawl.length];
    const status = NOT_FOUND.includes(path) ? 404 : 200;
    const time = slot * 600 + between(0, 59);
    entries.push({
      time,
      ip: BOT_IP,
      method: 'GET',
      path,
      protocol: 'HTTP/1.1',
      status,
      referer: '-',
      agent: BOT_AGENT,
    });
  }

  // The scanner: at 03:12, two passes over its list, one request every second or two.
  let time = 3 * 3600 + 12 * 60 + between(0, 30);
  for (const path of [...SCANNED, ...SCANNED]) {
    entries.push({
      time,
      ip: SCANNER_IP,
      method: 'GET',
      path,
      protocol: 'HTTP/1.1',
      status: 404,
      referer: '-',
      agent: SCANNER_AGENT,
    });
    time += between(1, 2);
  }

  // Array.prototype.sort is stable: what happens in the same second keeps its order.
  return entries
    .sort((a, b) => a.time - b.time)
    .map((entry) => `${format(entry)}\n`)
    .join('');
}
