// What an assistant tool looks like (Phase 11, lesson 3). A tool is one of the shop's functions that
// the model can ask to have run: the model runs nothing, it only asks ("call search_products with
// { query: 'mug' }"), and it's the shop that decides whether to do it and how.
import type Anthropic from '@anthropic-ai/sdk';

// #region run-as
// Who the tool works for: the customer of the session that asked the question. The route sets it,
// from the session, never the model: that way a tool can't do more than that customer could,
// whatever the conversation says.
export interface RunAs {
  customerId: number;
}
// #endregion run-as

// #region tool
export interface AssistantTool {
  // What the model sees, with the API's names: the name, the description (when to use it and what
  // it returns) and the JSON Schema of what to pass it. It goes in every request, in tools.
  definition: Anthropic.Tool;
  // What the customer sees while it runs, in the streamed tool event: "Searching products…". Always
  // the same sentence: never what the model passed it.
  label: string;
  // The function that does the work. input is what the model sends, unchecked: the first thing each
  // one does is read it with its Zod schema. What it returns goes to the model, in JSON.
  run(input: unknown, runAs: RunAs): Promise<unknown>;
}
// #endregion tool
