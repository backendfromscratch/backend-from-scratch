// The assistant's tools (Phase 11, lesson 3), all together: the ones offered to the model in every
// request and the function that runs the one it asks for. Adding a tool is writing its file, like
// search-products.ts, and putting it in this list.
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from '../../log.ts';
import { getOrder } from './get-order.ts';
import { searchProducts } from './search-products.ts';
import type { AssistantTool, RunAs } from './tool.ts';

// #region list
export const TOOLS: AssistantTool[] = [searchProducts, getOrder];

// What goes in every request to the model, in tools: the definitions, always in the same order.
export const definitions = TOOLS.map((tool) => tool.definition);

const byName = (name: string) => TOOLS.find((tool) => tool.definition.name === name);

// What the customer sees while it runs (the tool event). If the model asks for one that doesn't
// exist, nothing runs, but the customer sees the assistant is on it.
export const labelOf = (name: string) => byName(name)?.label ?? 'Checking the shop…';
// #endregion list

// #region run
// Runs the tool the model asked for and returns its result as the API expects it: a tool_result
// block with the call's id (tool_use_id), so the model knows which call it answers. It never throws:
// if the tool doesn't exist, if its input isn't valid or if it fails, the result carries
// is_error: true and a short sentence saying what happened, and the model decides what to do (fix
// the input, try something else or tell the customer). An error thrown here would bring down the
// whole answer because of a single tool.
export async function runTool(
  call: Anthropic.ToolUseBlock,
  runAs: RunAs,
  requestId: string,
): Promise<Anthropic.ToolResultBlockParam> {
  // One log line per call: which one and whether it failed. What the model passed it, no: it comes
  // from the conversation, which is the customer's.
  const result = (content: unknown, error = false): Anthropic.ToolResultBlockParam => {
    log.info({ requestId, tool: call.name, error }, 'the assistant uses a tool');
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      ...(error ? { is_error: true } : {}),
    };
  };

  const tool = byName(call.name);
  if (tool === undefined) return result(`There's no tool called ${call.name}`, true);
  try {
    return result(await tool.run(call.input, runAs));
  } catch (error) {
    // The input doesn't match its Zod schema: which field fails and why, so the model can fix it in
    // the next round.
    if (error instanceof z.ZodError) {
      const problems = error.issues.map(({ path, message }) =>
        path.length > 0 ? `${path.join('.')}: ${message}` : message,
      );
      return result(`The input isn't valid. ${problems.join('; ')}`, true);
    }
    // Any other failure (the database doesn't answer, a programming mistake): to the log, whole; to
    // the model, nothing of what happened inside.
    log.error({ err: error, requestId, tool: call.name }, 'an assistant tool failed');
    return result("The tool failed: it can't be looked up right now.", true);
  }
}
// #endregion run
