/**
 * The mcp world (spec §4.2; the lesson «Qué es MCP y cómo exponer tu backend a agentes»): the text's
 * three agents (and one more) and four services, with the MCP bus between them; the host of «Host,
 * cliente y servidor», with its person and its MCP client; an MCP client and the shop as an MCP
 * server, with its four tools; the JSON-RPC message between them; the API's two copies; how the
 * shop registers a tool and the one function behind its two doors; and the table of who calls with
 * what. It also uses the assistant world's `model`, `api`, `tools` and `shell`. Its persistent state
 * is the host's question and answer, the role the shop's server was built for (which decides the
 * tools it has) and what the table has shown. Everything else a scene lights up is undone by
 * `reset`. Its markup is Mcp.astro; its labels, strings.ts. Ids start with `mc-`.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Kind, Point, World } from '../../core/types';
import { strings, type Role } from './strings';

export interface McpState {
  /** The person's question in the host, and the host's answer (placeholder lines). */
  mcAsk: boolean;
  mcAnswer: boolean;
  /** The role of the key the shop's server was built for; '' before any key (all its tools). */
  mcRole: Role | '';
  /** The table of keys: how many of the three keys have listed their tools, and of the two refused. */
  mcListed: 0 | 1 | 2 | 3;
  mcRefused: 0 | 1 | 2;
}

export const MCP_INITIAL: McpState = {
  mcAsk: false,
  mcAnswer: false,
  mcRole: '',
  mcListed: 0,
  mcRefused: 0,
};

/** The roles of the table's three keys, in its order (the text's table): comparador, Reparto Rápido, Ana. */
export const KEY_ROLES: readonly Role[] = ['catalogo', 'reparto', 'admin'];

/**
 * The shop's four tools a role's server registers (indexes in strings' `tools`), as the text's
 * table: `catalogo` only the catalogue's two; `reparto` and `admin`, the four. Before any key, the
 * server as it is written: the four.
 */
export function toolsFor(role: Role | ''): readonly number[] {
  return role === 'catalogo' ? [0, 1] : [0, 1, 2, 3];
}

/** What the table's last column shows, row by row: the tools each key sees, and the two 401s. */
export function seen(s: Pick<McpState, 'mcListed' | 'mcRefused'>): string[] {
  return [
    ...KEY_ROLES.map((role, i) => (s.mcListed > i ? String(toolsFor(role).length) : '')),
    s.mcRefused > 0 ? '401' : '',
    s.mcRefused > 1 ? '401' : '',
  ];
}

type D = Director<McpState>;

/**
 * From one actor (or part) to another, between their facing sides. `lane` moves the line a fifth of
 * the shorter box to one side or the other, across the direction it travels: a request and its
 * answer, or a handshake's five messages, each keep their own line.
 */
export function route(d: Pick<D, 'box'>, from: string, to: string, lane = 0): Point[] {
  const a = d.box(from);
  const b = d.box(to);
  const [p, q] = facing(a, b);
  const across = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
  const off = lane * (across ? Math.min(a.h, b.h) : Math.min(a.w, b.w)) * 0.17;
  return across
    ? [
        { x: p.x, y: p.y + off },
        { x: q.x, y: q.y + off },
      ]
    : [
        { x: p.x + off, y: p.y },
        { x: q.x + off, y: q.y },
      ];
}

const path = (points: readonly Point[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

function line(d: D, points: readonly Point[]): void {
  d.stage.links.append(d.svg('path', { d: path(points), class: 'scene-link' }));
}

/** A line drawn from end to end and left on stage until the scene ends (the connectors, the MCP bus). */
export async function wire(d: D, points: readonly Point[], kind: Kind, dur = 700): Promise<void> {
  const drawn = d.svg('path', { d: path(points), class: 'scene-trail', 'data-kind': kind });
  d.stage.trails.append(drawn);
  await d.draw(drawn, dur);
}

/** A row of a card or a table lights up (reset puts it out). */
export function light(d: D, selector: string, kind: Kind = 'http'): void {
  d.q(selector).classList.add('is-lit');
  d.glow(selector, kind);
}

const text = (root: ParentNode, selector: string, value: string) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
};

/** The message card's rows, which each scene writes, emptied by `reset`. */
const WRITTEN = ['.mc-rpc-k', '.mc-rpc-v'];

export const mcp: World<McpState> = {
  id: 'mcp',
  views: {
    apart: ['agents', 'api', 'tools'],
    connectors: ['agents', 'newagent', 'mcpbus', 'services'],
    hostview: ['host', 'model', 'mcpshop'],
    wire: ['mcpclient', 'mcpshop', 'rpccard'],
    stateless: ['mcpclient', 'replicas'],
    doors: ['toolcard', 'doors'],
    keyring: ['apikeys', 'mcpshop'],
    trymcp: ['shell', 'mcpshop'],
  },
  zoom: { connectors: 1.6, doors: 1.6 },

  reset(root) {
    for (const selector of WRITTEN)
      root.querySelectorAll(selector).forEach((element) => (element.textContent = ''));
    root.querySelectorAll('.mc-room.is-on').forEach((room) => room.classList.remove('is-on'));
    root.querySelectorAll('.is-lit').forEach((row) => row.classList.remove('is-lit'));
  },

  apply(root, s, lang) {
    const t = strings[lang];
    root.querySelector('#mc-ask')?.classList.toggle('is-on', s.mcAsk);
    root.querySelector('#mc-answer')?.classList.toggle('is-on', s.mcAnswer);
    const tools = toolsFor(s.mcRole);
    t.tools.forEach((_, i) =>
      root.querySelector(`#mc-tool-${i + 1}`)?.classList.toggle('is-gone', !tools.includes(i)),
    );
    text(root, '#mc-role', s.mcRole ? `${t.role}: ${t.roles[s.mcRole]}` : '');
    seen(s).forEach((value, i) => text(root, `#mc-seen-${i + 1}`, value));
  },

  wires(d) {
    const link = (a: string, b: string) => {
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b));
    };
    if (d.shown('host') && d.shown('mcpshop')) line(d, route(d, '#mc-host-client', 'mcpshop'));
    link('host', 'model');
    link('mcpclient', 'mcpshop');
    link('apikeys', 'mcpshop');
    link('shell', 'mcpshop');
    if (d.shown('mcpclient') && d.shown('replicas')) {
      for (const copy of ['a', 'b']) line(d, route(d, 'mcpclient', `#mc-copy-${copy}`));
    }
    if (d.shown('doors')) {
      for (const door of [1, 2]) line(d, route(d, `#mc-door-${door}`, '#mc-fn'));
    }
  },
};
