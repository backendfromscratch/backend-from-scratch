// Checks that a response meets the contract: the OpenAPI document the API itself publishes at
// /v2/openapi.json. It is the same validator the API uses in production
// (src/contract-responses.ts).
import assert from 'node:assert/strict';
import { contractDocument, createValidator } from '../src/contract-responses.ts';

// The document and the validator are created once: compiling the schemas is the expensive part.
const validate = createValidator(contractDocument());

/**
 * Throws an AssertionError listing each field that doesn't meet it, if the response is not what
 * the contract says for that method, that route (as the document writes it: /orders/{id}) and
 * that status. It reads a copy: the response can still be read afterwards.
 */
export async function matchesContract(res: Response, method: string, route: string): Promise<void> {
  const type = res.headers.get('content-type') ?? '';
  const body = /json/.test(type) ? await res.clone().json() : undefined;
  const failures = validate(method, route, res.status, body);
  assert.deepEqual(
    failures,
    [],
    `${method.toUpperCase()} ${route} → ${res.status} does not meet the contract:\n` +
      failures
        .map((failure) => `  ${failure.where || '(root)'}: ${failure.message} [${failure.rule}]`)
        .join('\n'),
  );
}
