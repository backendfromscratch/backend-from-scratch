import { describe, expect, it } from 'vitest';
import { KEY_ROLES, MCP_INITIAL, seen, toolsFor } from './mcp';
import { strings } from './strings';

describe('the tools each role’s server registers', () => {
  it('are the text’s table: the catalogue’s two for catalogo, all four for reparto and admin', () => {
    expect(toolsFor('catalogo').map((i) => strings.es.tools[i])).toEqual([
      'buscar_productos',
      'ver_producto',
    ]);
    expect(toolsFor('reparto')).toHaveLength(4);
    expect(toolsFor('admin')).toHaveLength(4);
  });

  it('are all four before any key: the server as it is written', () => {
    expect(toolsFor('')).toEqual([0, 1, 2, 3]);
  });
});

describe('the table of keys', () => {
  it('lists the comparador, Reparto Rápido and Ana with the text’s roles, in its order', () => {
    expect(KEY_ROLES).toEqual(['catalogo', 'reparto', 'admin']);
    expect(strings.es.keys.rows.slice(0, 3).map(([, role]) => role)).toEqual(
      KEY_ROLES.map((role) => strings.es.roles[role]),
    );
    expect(strings.en.keys.rows.slice(0, 3).map(([, role]) => role)).toEqual(
      KEY_ROLES.map((role) => strings.en.roles[role]),
    );
  });

  it('starts empty, then shows two, four and four tools, and a 401 for the session and no key', () => {
    expect(seen(MCP_INITIAL)).toEqual(['', '', '', '', '']);
    expect(seen({ mcListed: 3, mcRefused: 2 })).toEqual(['2', '4', '4', '401', '401']);
    expect(seen({ mcListed: 1, mcRefused: 1 })).toEqual(['2', '', '', '401', '']);
  });
});
