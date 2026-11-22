// The tool loop (Phase 11, lesson 3), written by hand to see there's no magic: the model is asked;
// if it stops because it wants to use tools (stop_reason: tool_use), the shop runs them, gives it
// the results and asks it again, with everything before; and so on until it answers (end_turn).
// Each question to the model is a round. The SDK comes with one ready-made (the Tool Runner,
// client.beta.messages.toolRunner), which does this same thing inside.
//
// It doesn't know how the question is asked (with the whole answer or streamed) or what each tool
// does: whoever uses it (route.ts) tells it, with the functions in steps. That way it works for both
// ways of answering, and the tests try it with fake functions.
import type Anthropic from '@anthropic-ai/sdk';

// #region steps
// At most five questions to the model for each question from the customer. Each round costs tokens
// (the whole conversation, again) and time: a model that asks for tools non-stop can't spend without
// a limit.
export const MAX_ROUNDS = 5;

export interface Steps {
  // Asks the model with the conversation so far and returns its whole message.
  ask(conversation: Anthropic.MessageParam[]): Promise<Anthropic.Message>;
  // Runs one call to a tool. It never throws: if it fails, its result says so (is_error).
  run(call: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam>;
  // Optional: tells about each call before running it (the stream sends a tool event).
  onUse?(call: Anthropic.ToolUseBlock): Promise<void>;
}

// What happened: the model's message in each round, in order (the last one is the one that ends),
// and whether MAX_ROUNDS was reached with the model still asking for tools.
export interface Result {
  messages: Anthropic.Message[];
  exhausted: boolean;
}
// #endregion steps

// #region converse
export async function converse(start: Anthropic.MessageParam[], steps: Steps): Promise<Result> {
  const conversation = [...start];
  const messages: Anthropic.Message[] = [];
  while (true) {
    const message = await steps.ask(conversation);
    messages.push(message);
    // Tools only run if the model stopped for that. With end_turn it has finished; with max_tokens
    // it ran out of room, maybe with a call cut in half; with refusal it refused. In all those cases,
    // the answer ends here, without running anything.
    if (message.stop_reason !== 'tool_use') return { messages, exhausted: false };
    if (messages.length === MAX_ROUNDS) return { messages, exhausted: true };

    // It can ask for several at once (in parallel): they all run at once, with Promise.all.
    const calls = message.content.filter((block) => block.type === 'tool_use');
    for (const call of calls) await steps.onUse?.(call);
    const results = await Promise.all(calls.map((call) => steps.run(call)));

    // The model's message goes into the conversation as it is, with its calls (and whatever it
    // thought), and then a single user message with all the results. The API remembers nothing: in
    // the next round, it's all sent again.
    conversation.push(
      { role: 'assistant', content: message.content },
      { role: 'user', content: results },
    );
  }
}
// #endregion converse
