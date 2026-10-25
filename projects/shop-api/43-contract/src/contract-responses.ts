// The API's responses, watched by its own contract (Phase 10, lesson 3). The contract tests check
// each route with an example request; this checks the real responses, the ones clients see. If one
// doesn't have the shape /v2/openapi.json promises, a field that changes its name or a number that
// arrives as text, it is known: with a warning in the log, or with a 500 (VALIDATE_RESPONSES). The
// validator is the same one in the tests (test/contract.ts).
import type { ErrorObject, ValidateFunction } from 'ajv';
import _Ajv2020 from 'ajv/dist/2020.js';
import type { MiddlewareHandler } from 'hono';
import type { Env } from './env.ts';
import { log } from './log.ts';
import { problem } from './problems.ts';
import { v2 } from './v2.ts';

// #region document
// Version 2's contract, in OpenAPI 3.1: OpenAPIHono writes it from v2's routes and schemas.
// servers says that the document's routes (/products) hang from /v2. It is used by
// /v2/openapi.json, the validator and contract.json.
export const contractDocument = () =>
  v2.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: "API for Ana and Luis's shop",
      version: '2.0.0',
      description: "The shop's products and orders. Prices are in cents.",
    },
    servers: [{ url: '/v2' }],
  });
// #endregion document

// #region validator
// What fails and where, without the value: a response's body can carry personal data, and this
// ends up in the log. where is the path inside the body (/priceCents, /0/name), rule is the JSON
// Schema word that isn't met (required, type…) and message explains it.
export type ContractFailure = { where: string; rule: string; message: string };

type Document = {
  paths?: Record<string, Record<string, { responses?: Record<string, ResponseSpec> }>>;
  components?: { schemas?: Record<string, unknown> };
};
type ResponseSpec = { content?: Record<string, { schema?: object }> };

// Ajv is a CommonJS module: Node hands over the class as the default import, and TypeScript, the
// whole module. It is told which one it is.
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;

const COMPONENTS_ID = 'https://shop.example/contract.json';
const NO_RESPONSE = 'no-response-in-the-contract';

export function createValidator(document: object) {
  const { paths = {}, components } = document as Document;
  // strict: false, because the document carries OpenAPI words JSON Schema doesn't know;
  // validateFormats: false, because the shape is checked (fields and types), not that a text is a
  // date; allErrors, to say everything that fails at once.
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  // The named schemas (#/components/schemas/Order), once; each response links to them with their
  // full address.
  ajv.addSchema({ $id: COMPONENTS_ID, components }, COMPONENTS_ID);
  const compiled = new Map<string, ValidateFunction | null>();

  // Each response is compiled the first time it is needed, and kept.
  function compile(method: string, route: string, status: number) {
    const key = `${method} ${route} ${status}`;
    if (!compiled.has(key)) {
      const response = paths[route]?.[method]?.responses?.[String(status)];
      const schema = Object.entries(response?.content ?? {}).find(([type]) =>
        /json/.test(type),
      )?.[1].schema;
      compiled.set(
        key,
        schema
          ? ajv.compile(
              JSON.parse(
                JSON.stringify(schema).replaceAll(
                  '"#/components/',
                  `"${COMPONENTS_ID}#/components/`,
                ),
              ),
            )
          : null,
      );
    }
    return compiled.get(key)!;
  }

  const validate = (
    method: string,
    route: string,
    status: number,
    body: unknown,
  ): ContractFailure[] => {
    method = method.toLowerCase();
    const response = paths[route]?.[method]?.responses?.[String(status)];
    if (!response) {
      return [
        {
          where: '',
          rule: NO_RESPONSE,
          message: `the contract does not describe a ${status} for ${method.toUpperCase()} ${route}`,
        },
      ];
    }
    const validateBody = compile(method, route, status);
    if (!validateBody) {
      // A response without a JSON body in the contract (a 204, a redirect): it must not have one.
      return body === undefined
        ? []
        : [{ where: '', rule: NO_RESPONSE, message: 'the contract does not describe a JSON body' }];
    }
    if (body === undefined) {
      return [
        { where: '', rule: 'no-body', message: 'the contract describes a body and there is none' },
      ];
    }
    if (validateBody(body)) return [];
    return (validateBody.errors ?? []).map((error: ErrorObject) => {
      // A field that is missing or extra: the error points at the object; the path, at the field.
      const field = error.params.missingProperty ?? error.params.additionalProperty;
      return {
        where: field === undefined ? error.instancePath : `${error.instancePath}/${field}`,
        rule: error.keyword,
        message: error.message ?? '',
      };
    });
  };

  // The document's routes as regular expressions, to know which route of the document a real
  // path corresponds to (/orders/7 is /orders/{id}). It is needed when the response was made by a
  // middleware before reaching any route, and Hono only knows how to say "/*".
  const routes = Object.keys(paths).map((template) => ({
    template,
    expression: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}/?$`),
  }));
  const templateOf = (path: string) =>
    routes.find((route) => route.expression.test(path))?.template;

  return Object.assign(validate, { templateOf });
}
// #endregion validator

// #region template
// Hono knows the route that served the request as /v2/orders/:id; the document, as /orders/{id},
// without the version's prefix. This goes from one to the other.
export function routeTemplate(honoRoute: string, prefix: string) {
  const withoutPrefix = honoRoute.startsWith(prefix) ? honoRoute.slice(prefix.length) : honoRoute;
  return withoutPrefix.replace(/:(\w+)(\{[^}]*\})?/g, '{$1}');
}
// #endregion template

// #region middleware
type Options = { document?: () => object; prefix?: string };

// The middleware: it lets the route answer and, afterwards, looks at what it answered. Only
// responses with a JSON body: a 204, an event stream (SSE) or an HTML page isn't touched. It looks
// at a copy, so the original response goes on its way just the same.
export function validateResponses(
  mode: 'log' | 'fail',
  { document = contractDocument, prefix = '/v2' }: Options = {},
): MiddlewareHandler<Env> {
  let validator: ReturnType<typeof createValidator> | undefined;
  return async (c, next) => {
    await next();
    const res = c.res;
    if (res.body === null || !/json/.test(res.headers.get('content-type') ?? '')) return;
    // A method the route doesn't have (v2.all, in v2.ts): the contract describes operations, and
    // that one isn't. Its 405 is checked by problems.test.ts.
    if (res.status === 405) return;
    // A 5xx no route foresaw: app.onError has already logged it, and it isn't that the response
    // breaks the contract, it's that something failed. It is neither counted here nor replaced.
    if (res.status >= 500) return;
    validator ??= createValidator(document());
    // routePath, after next(), is the route that answered. If the response was made by a
    // middleware (the CSRF check, the session), it is "/*": the path is looked up among the
    // document's routes. What isn't a route of the contract (the document itself, a /v2/something
    // that doesn't exist and falls into the 404) isn't validated.
    const honoRoute = c.req.routePath;
    if (honoRoute === `${prefix}/openapi.json`) return;
    const path = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : c.req.path;
    const route = honoRoute.includes('*')
      ? validator.templateOf(path)
      : routeTemplate(honoRoute, prefix);
    if (route === undefined) return;
    // Hono serves a HEAD with the GET's route (and then removes the body): the contract describes
    // it as GET.
    const method = c.req.method === 'HEAD' ? 'GET' : c.req.method;
    const body: unknown = await res
      .clone()
      .json()
      .catch(() => undefined);
    const failures =
      body === undefined
        ? [{ where: '', rule: 'invalid-json', message: 'the body is not JSON' }]
        : validator(method, route, res.status, body);
    if (failures.length === 0) return;
    const requestId = c.get('requestId');
    if (mode === 'log') {
      // The failures say where and which rule, never the value: see ContractFailure.
      log.warn(
        { requestId, method, route, status: res.status, failures: failures.slice(0, 10) },
        'response outside the contract',
      );
      return;
    }
    log.error(
      { requestId, method, route, status: res.status, failures: failures.slice(0, 10) },
      'response outside the contract',
    );
    // The 500 doesn't inherit what the broken response carried: a Location or a session cookie
    // make no sense in an error. X-Request-Id does.
    for (const header of ['Location', 'Set-Cookie', 'ETag', 'Content-Length']) {
      c.res.headers.delete(header);
    }
    c.res = problem(c, {
      type: 'about:blank',
      title: 'The response does not meet the contract',
      status: 500,
      detail: "This response doesn't have the shape the contract promises (/v2/openapi.json).",
      instance: `urn:uuid:${requestId}`,
    });
  };
}
// #endregion middleware
