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
  // one does is read it with its Zod schema. What it returns goes to the model, in JSON (a string,
  // as it is), unless it's SearchResults (below).
  run(input: unknown, runAs: RunAs): Promise<unknown>;
}
// #endregion tool

// #region search-results
// A source (lesson 6): a section of a help page. page is its file's name (returns, from
// help/returns.md), title the page's title and section the section's.
export interface Source {
  page: string;
  title: string;
  section: string;
}

// Where a section comes from, with the API's names: source, its page's file, and title, its two
// titles. It's what its search_result block carries (search-help.ts), and what comes back in each
// citation of the answer that comes from it (conversation.ts).
export const originOf = ({ page, title, section }: Source) => ({
  source: `help/${page}.md`,
  title: `${title}: ${section}`,
});

// What a tool that searches documents returns (search_help, lesson 6), instead of any old data. It
// goes to the model another way: not in JSON, but as search_result blocks, the format the API has
// for search results (each with its source, its title and its text) and with citations turned on.
// With them, the model's answer says which result each sentence comes from (citations, on its text
// blocks). And it carries, separately and in the same order, each block's source: with them, the
// shop knows which section each citation is from, with its own data.
export class SearchResults {
  readonly blocks: Anthropic.SearchResultBlockParam[];
  readonly sources: Source[];

  constructor(blocks: Anthropic.SearchResultBlockParam[], sources: Source[]) {
    this.blocks = blocks;
    this.sources = sources;
  }
}
// #endregion search-results
