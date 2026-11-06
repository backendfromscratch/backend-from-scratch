// Serves web/dist on a port, for the screenshots (playwright.visual.config.ts). With no dependencies:
// it runs inside Playwright's Docker image, where this project's own packages, installed for your
// computer's system, would not load (astro preview needs them). A folder serves its index.html,
// and a missing file 404.html with a 404, as Cloudflare does.
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname));
  let file = join(root, path);
  // Nothing outside dist/ (normalize has already resolved any ../ in the path).
  if (!file.startsWith(root)) return response.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': types['.html'] });
    response.end(await readFile(join(root, '404.html')));
  }
}).listen(Number(process.argv[2]), '127.0.0.1');
