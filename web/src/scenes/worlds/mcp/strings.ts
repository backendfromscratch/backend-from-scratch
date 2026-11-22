/**
 * The mcp world's labels in both languages (mcp.ts, Mcp.astro): «Qué es MCP y cómo exponer tu
 * backend a agentes» / "What MCP is and how to expose your backend to agents". Tool names, roles,
 * the shop's name and its functions are each language's project's (tienda-api, shop-api).
 */
import type { Locale } from '../../../lib/locales';

/** The three roles of the text's table, by a language-neutral id. */
export type Role = 'catalogo' | 'reparto' | 'admin';

export interface McpStrings {
  /** The text's three agents, and the one more that arrives. */
  agents: readonly [string, string, string];
  /** What each agent does, as the text's problem tells it. */
  does: readonly [string, string, string];
  newAgent: string;
  /** The text's four services. */
  services: readonly [string, string, string, string];
  client: string;
  server: string;
  /** The host of «Host, cliente y servidor»: Claude Code, its person's question. */
  host: { title: string; sub: string; ask: string };
  /** The shop as an MCP server: its name, its four tools (in the text's table's order), its role line. */
  shop: string;
  tools: readonly [string, string, string, string];
  role: string;
  roles: Record<Role, string>;
  /** The API's two copies (Phase 9) and what each POST builds in them. */
  copies: { title: string; built: string };
  /** `buscar_productos` as the shop registers it, and the one function behind its two doors. */
  tool: { rows: readonly (readonly [string, string])[] };
  doors: { assistant: string; lesson: string; fn: string };
  /** Who calls, with what, and what `tools/list` gives back. */
  keys: {
    head: readonly [string, string, string];
    rows: readonly (readonly [string, string])[];
  };
}

export const strings: Record<Locale, McpStrings> = {
  es: {
    agents: ['Claude Code', 'Reparto Rápido', 'comparador'],
    does: ['el tuyo', 'envía pedidos', 'lee el catálogo'],
    newAgent: 'otro agente',
    services: ['tienda', 'GitHub', 'calendario', 'base de datos'],
    client: 'cliente MCP',
    server: 'servidor MCP',
    host: { title: 'Claude Code', sub: 'host', ask: '¿Qué pedidos hay para enviar?' },
    shop: 'tienda',
    tools: ['buscar_productos', 'ver_producto', 'pedidos_para_enviar', 'marcar_enviado'],
    role: 'rol',
    roles: { catalogo: 'catalogo', reparto: 'reparto', admin: 'admin' },
    copies: { title: 'tienda · 2 copias', built: 'servidor + transporte' },
    tool: {
      rows: [
        ['name', 'buscar_productos'],
        ['description', 'para el modelo'],
        ['inputSchema', 'Zod → JSON Schema'],
        ['annotations', 'readOnlyHint: true'],
      ],
    },
    doors: { assistant: 'asistente', lesson: 'lección 3', fn: 'buscarProductosPorNombre' },
    keys: {
      head: ['quién', 'con', 've'],
      rows: [
        ['comparador', 'catalogo'],
        ['Reparto Rápido', 'reparto'],
        ['Ana o Luis', 'admin'],
        ['Carmen', 'sesión'],
        ['nadie', 'sin clave'],
      ],
    },
  },
  en: {
    agents: ['Claude Code', 'Fast Delivery', 'comparison site'],
    does: ['yours', 'ships orders', 'browses catalog'],
    newAgent: 'another agent',
    services: ['shop', 'GitHub', 'calendar', 'database'],
    client: 'MCP client',
    server: 'MCP server',
    host: { title: 'Claude Code', sub: 'host', ask: 'Which orders are there to ship?' },
    shop: 'shop',
    tools: ['search_products', 'get_product', 'orders_to_ship', 'mark_shipped'],
    role: 'role',
    roles: { catalogo: 'catalogue', reparto: 'delivery', admin: 'admin' },
    copies: { title: 'shop · 2 copies', built: 'server + transport' },
    tool: {
      rows: [
        ['name', 'search_products'],
        ['description', 'for the model'],
        ['inputSchema', 'Zod → JSON Schema'],
        ['annotations', 'readOnlyHint: true'],
      ],
    },
    doors: { assistant: 'assistant', lesson: 'lesson 3', fn: 'searchProductsByName' },
    keys: {
      head: ['who', 'with', 'sees'],
      rows: [
        ['comparison site', 'catalogue'],
        ['Fast Delivery', 'delivery'],
        ['Ana or Luis', 'admin'],
        ['Carmen', 'session'],
        ['nobody', 'no key'],
      ],
    },
  },
};
