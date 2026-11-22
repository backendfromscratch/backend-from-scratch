// A product's description, written by the model (Phase 11, lesson 7). It's long work: a call to the
// model takes a few seconds, and it can fail (a 429, a 529, a cut) and need repeating. That's why
// the API doesn't do it while an admin waits, but the worker, with the queue (queue.ts): if it
// fails, BullMQ tries it again (JOB_OPTIONS: five attempts, with 1, 2, 4 and 8 seconds between
// them), on top of the SDK's own retries (MODEL_RETRIES, config.ts). POST
// /v2/products/{id}/description (v2.ts) requests it, with an outbox event (requestDescription, in
// data.ts).
// For many products at once, the Claude API has another door: Message Batches, which runs the
// requests at half price and returns the results within 24 hours. For one, that someone asks for
// now, the queue is enough.
import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.ts';
import { findProduct, type Product, updateProduct } from '../data.ts';
import { log } from '../log.ts';
import { descriptionSchema } from '../schemas.ts';
import { client } from './client.ts';
import { MAX_TOKENS, textOf } from './conversation.ts';
import { recordCall } from './cost.ts';

// #region request
// Its instructions, in their own file, like the assistant's: what a good description is and what it
// can't make up.
const instructions = readFileSync(new URL('description.md', import.meta.url), 'utf8');

// A single call, without tools: everything the model needs goes in the request. The product's data,
// as JSON, in the user's message: that way it doesn't mix with the instructions. With the same
// model and the same effort as the assistant (config.ts).
export function descriptionRequest(product: Product): Anthropic.MessageCreateParamsNonStreaming {
  const { name, priceCents, categories, description } = product;
  return {
    model: config.MODEL,
    max_tokens: MAX_TOKENS,
    system: instructions,
    output_config: { effort: config.EFFORT },
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ name, priceCents, categories, description }),
      },
    ],
  };
}
// #endregion request

// #region write
// The job: reads the product, asks for the description and saves it. If the model fails, the
// SDK's error comes out of here and the job fails: the queue will repeat it. The description is
// checked with the same schema as the one an admin writes by hand (schemas.ts: 1 to 500
// characters): what the model writes is one more input, and it isn't saved without looking at it.
// If it isn't valid (empty, too long, cut by max_tokens), it fails too: another attempt may work.
// Saving it with updateProduct (data.ts) does what any description change does: it deletes its
// vector and saves the event to compute the new one (lesson 5), and takes it out of the cache.
export async function writeDescription(productId: number): Promise<void> {
  // The route doesn't request anything without a key; but the worker could start with another
  // configuration. Repeating it wouldn't fix it: it's said in the log, and the job counts as done.
  if (client === undefined) {
    log.warn({ productId }, "no ANTHROPIC_API_KEY: the description can't be written");
    return;
  }
  const product = await findProduct(productId);
  if (product === undefined) {
    log.info({ productId }, 'the product no longer exists: there is no description to write');
    return;
  }
  // At most, as long as the shop waits for an assistant's answer: a stuck job mustn't keep the
  // worker busy forever.
  const message = await client.messages.create(descriptionRequest(product), {
    signal: AbortSignal.timeout(config.ASSISTANT_TIMEOUT_MS),
  });
  // What it cost, to the log and the metrics, like the assistant's calls (cost.ts). No budget: an
  // admin asks for it, not a customer.
  recordCall(message, { job: 'product-description', productId });
  // #region check-description
  // A refusal isn't fixed by repeating: it's noted, and the product stays as it was.
  if (message.stop_reason === 'refusal') {
    log.warn({ productId, message: message.id }, 'the model refused to write the description');
    return;
  }
  const parsed = descriptionSchema.safeParse(textOf(message));
  if (message.stop_reason !== 'end_turn' || !parsed.success) {
    throw new Error(
      `the model didn't write a valid description (stop_reason: ${message.stop_reason})`,
    );
  }
  await updateProduct(productId, { description: parsed.data });
  log.info({ productId, message: message.id }, 'description written');
  // #endregion check-description
}
// #endregion write
