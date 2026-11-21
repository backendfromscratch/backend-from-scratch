// The shop's MCP server (Phase 11, lesson 4). MCP (Model Context Protocol) is a protocol for any
// agent (Claude Code, the MCP Inspector, another company's agent) to discover what tools a server
// has and use them, without anyone writing code for each pair of agent and server. Underneath it's
// JSON-RPC: the agent sends { "method": "tools/list" } to see the list and
// { "method": "tools/call", "params": { "name": …, "arguments": … } } to use one.
//
// It lives inside the same API, at POST /mcp, with the official SDK's Streamable HTTP transport
// (@modelcontextprotocol/sdk): each message is a POST, and the response, JSON. It's the shop's
// other door: the tools call the same functions as the /v2 routes and the assistant (a single way
// to find a product or to ship an order, with two doors).
//
// MCP doesn't decide who can do what: the API key and its role do (Phase 6), as in the rest of the
// shop. Each request brings its key, and that request's server only has the tools its role allows.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiKey } from './api-keys.ts';
import {
  DESCRIPTION_BY_MEANING,
  DESCRIPTION_BY_NAME,
  QUERY_BY_MEANING,
  QUERY_BY_NAME,
  searchCatalogue,
} from './assistant/tools/search-products.ts';
import { config } from './config.ts';
import { findProduct, shipOrder } from './data.ts';
import type { Env } from './env.ts';
import { log } from './log.ts';
import { pageByCursor } from './pagination.ts';
import { roleCan } from './permissions.ts';
import { httpProblem } from './problems.ts';
import { cursorSchema } from './schemas.ts';

// #region results
// What an MCP tool returns: a list of content blocks. Here, one text block with the result as JSON,
// which any agent can read. Always bounded: at most 10 products, 50 orders or a single one. (MCP
// also has structuredContent, with an output schema; text is understood by every client, including
// the ones that don't read it.)
const asJson = (data: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
});

// An error the agent has to see: isError: true, and a sentence that says what happened, so it can
// decide what to do (try another id, tell the person). It isn't a protocol error: the call arrived
// fine, and it's the tool that couldn't do it.
const failure = (text: string): CallToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

// The largest number a PostgreSQL integer column holds, as in get_order: no id can be larger.
const MAX_ID = 2_147_483_647;
const idSchema = (description: string) =>
  z.number().int().positive().max(MAX_ID).describe(description);
// #endregion results

// #region server
// An MCP server for one request and one key. It's the SDK's stateless mode: each POST creates its
// own and throws it away at the end, with no sessions to keep, so it doesn't matter which copy of
// the API answers (Phase 9). And since it's created with the key in hand, it only has the tools its
// role can use.
function createServer(apiKey: ApiKey, requestId: string): McpServer {
  const server = new McpServer({ name: 'shop-api', version: '1.0.0' });

  // #region use
  // Each tool works inside this function: one log line per call (which one, with which key and
  // whether it failed; what the agent passed, no) and, if something breaks inside, a short sentence
  // for the agent and the whole error to the log. Without this, the SDK would send the agent the
  // error's message as is, with whatever it carries (an internal network address, a piece of SQL).
  async function use(tool: string, work: () => Promise<CallToolResult>): Promise<CallToolResult> {
    const data = { requestId, apiKey: apiKey.id, tool };
    try {
      const result = await work();
      log.info({ ...data, error: result.isError === true }, 'an agent uses a tool (MCP)');
      return result;
    } catch (error) {
      log.error({ ...data, err: error }, 'an MCP tool has failed');
      return failure('The tool has failed: it cannot be looked up right now.');
    }
  }
  // #endregion use

  // #region search-products
  // The catalogue's two, for any key. The description is for the agent: it reads it to decide when
  // to use it, what to pass and how to read what it returns. The Zod schema does two jobs: the SDK
  // turns it into the JSON Schema the agent sees in tools/list, and checks each call against it
  // before running anything (one that doesn't match never gets here: the agent gets isError with
  // what fails). annotations are hints for the client (readOnlyHint: it only reads, and a client
  // may use it without asking the person), never security: the security is the key.
  // Since lesson 5, it searches by meaning, with the same descriptions as the assistant's tool (or
  // by name, with SEMANTIC_SEARCH=no).
  const byMeaning = config.SEMANTIC_SEARCH === 'yes';
  server.registerTool(
    'search_products',
    {
      title: 'Search products',
      description: byMeaning ? DESCRIPTION_BY_MEANING : DESCRIPTION_BY_NAME,
      inputSchema: z.strictObject({
        query: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .describe(byMeaning ? QUERY_BY_MEANING : QUERY_BY_NAME),
      }),
      annotations: { readOnlyHint: true },
    },
    // The same function as the assistant's search_products tool.
    async ({ query }) => use('search_products', async () => asJson(await searchCatalogue(query))),
  );
  // #endregion search-products

  // #region get-product
  server.registerTool(
    'get_product',
    {
      title: 'Get a product',
      description:
        "Looks up a catalogue product by its id (the one search_products returns): its name, its price in euro cents (priceCents), the units left (stock), its description (or null) and its categories. If there's no product with that id, it says so.",
      inputSchema: z.strictObject({ id: idSchema('The product id: 2.') }),
      annotations: { readOnlyHint: true },
    },
    // The same function as GET /v2/products/{id}, with its cache.
    async ({ id }) =>
      use('get_product', async () => {
        const product = await findProduct(id);
        return product ? asJson(product) : failure('There is no product with that id.');
      }),
  );
  // #endregion get-product

  // #region orders-to-ship
  // The delivery company's two, only if the key's role has the permission: the same one the /v2
  // route that does the same asks for (permissions.ts). A tool the key can't use doesn't exist in
  // its server: it doesn't show up in tools/list, so the agent doesn't even try it, and if it calls
  // it anyway, the SDK answers isError: "MCP error -32602: Tool mark_shipped not found".
  if (roleCan(apiKey.role, 'orders:view-all')) {
    server.registerTool(
      'orders_to_ship',
      {
        title: 'Orders to ship',
        description:
          'The paid orders waiting for the delivery company to ship them, newest first, in pages. Each order has its id, the product id (productId: its name, with get_product), the quantity, its status (paid), when it was placed (createdAt, in UTC) and the customer id (customerId). Returns { orders, next }: if next is not null, there are more orders; to see them, call again with cursor set to next.',
        inputSchema: z.strictObject({
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe('How many orders at most, from 1 to 50. If not given, 10.'),
          // The same schema as GET /v2/orders's ?cursor=: it reads the date and the id inside it.
          cursor: cursorSchema
            .optional()
            .describe("The previous page's next value. Without it, the first page."),
        }),
        annotations: { readOnlyHint: true },
      },
      // The same function as GET /v2/orders?status=paid.
      async ({ limit, cursor }) =>
        use('orders_to_ship', async () => {
          const { page, next } = await pageByCursor(limit, cursor, 'paid');
          return asJson({ orders: page, next: next ?? null });
        }),
    );
  }
  // #endregion orders-to-ship

  // #region mark-shipped
  // This one changes something: no readOnlyHint, and a client may ask the person to confirm before
  // using it. destructiveHint: false (it deletes nothing) and idempotentHint: true (calling it
  // twice with the same id changes nothing more: the second says it's already shipped).
  if (roleCan(apiKey.role, 'orders:ship')) {
    server.registerTool(
      'mark_shipped',
      {
        title: 'Mark an order as shipped',
        description:
          "Marks a paid order as shipped, once the delivery company has it. It only works on an order in the paid status: one pending payment, cancelled or already shipped doesn't change, and the tool says which status it's in. Returns the order, now in the shipped status. It can't be undone.",
        inputSchema: z.strictObject({ id: idSchema('The order number: 13.') }),
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      // The same function as POST /v2/orders/{id}/shipment (data.ts).
      async ({ id }) =>
        use('mark_shipped', async () => {
          const result = await shipOrder(id);
          if (!('error' in result)) return asJson(result.order);
          if (result.error === 'not-found') return failure('There is no order with that number.');
          return failure(`The order is ${result.status}: only a paid one is shipped.`);
        }),
    );
  }
  // #endregion mark-shipped

  return server;
}
// #endregion server

export const mcp = new Hono<Env>();

// #region require-key
// Before MCP, the key: without an API key that exists (loadApiKey, in app.ts, has already looked it
// up), 401, with the same WWW-Authenticate header as the rest of the shop. Keys only: a person's
// session (the cookie, or its id as Bearer) doesn't work here, because an agent works with a role,
// not as a customer. The MCP specification also asks to check the Origin header, in case a website
// makes the browser call a password-less MCP server on your computer (DNS rebinding); here the key
// stops that, since the browser never sends it on its own.
mcp.use(async (c, next) => {
  if (c.var.apiKey === undefined) {
    return httpProblem(
      c,
      401,
      'Identify yourself with a shop API key: Authorization: Bearer shop_…',
      {
        'WWW-Authenticate': 'Bearer realm="shop-api"',
      },
    );
  }
  await next();
});
// #endregion require-key

// #region route
// Each POST, its own server and transport, with this request's key. sessionIdGenerator: undefined
// is stateless mode (there's no Mcp-Session-Id header), and enableJsonResponse: true makes each
// response a whole JSON, instead of a Server-Sent Events stream: these tools answer at once, and
// nginx needs nothing special (nginx/shop.conf). The transport works with the web's Request and
// Response (fetch's): the same as Hono's, so it takes the request as is (c.req.raw). It makes its
// response itself, not Hono, and it lacks what the shop had already set with c.header(), like
// requestId()'s X-Request-Id (app.ts): c.newResponse makes it again, with its status, its body and
// its headers, and those too.
mcp.post('/', async (c) => {
  const server = createServer(c.var.apiKey!, c.get('requestId'));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(c.req.raw);
    return c.newResponse(response.body, response);
  } finally {
    // The response is already whole: this request's server and transport are no longer needed.
    await server.close();
  }
});

// GET would open a stream for the server to send messages whenever it wants, and DELETE would close
// a session. Stateless, there's neither: 405, as the SDK recommends, and in Allow, what there is.
// An MCP client understands the GET's 405 and carries on without that stream.
mcp.all('/', (c) =>
  httpProblem(c, 405, 'This MCP server keeps no sessions: it only accepts POST', {
    Allow: 'POST',
  }),
);
// #endregion route
