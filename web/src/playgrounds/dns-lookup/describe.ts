/** Turns the path and the result into sentences in the page's language. */
import { fill } from '../../lib/fill';
import type { DnsRecord, LookupResult, PathStep } from './dns';
import { RESOLVER } from './resolver';
import type { Strings } from './strings';

/** “the root”, “.com” (a TLD, with its dot) or the zone name as is. */
export function zoneLabel(zone: string, t: Strings): string {
  if (zone === '.') return t.root;
  return zone.includes('.') ? zone : `.${zone}`;
}

/** The first server and how many more there are: “a.root-servers.net and 12 more”. */
export function serversLabel(servers: string[], t: Strings): string {
  const [first = '', ...rest] = servers;
  return rest.length === 0 ? first : fill(t.andMore, { first, n: rest.length });
}

/** The lowest TTL: how long the complete answer lasts in the cache. */
export function minTtl(records: DnsRecord[]): number {
  return Math.min(...records.map((record) => record.ttl));
}

/** A readable value: without the trailing dot of names (in MX, NS and CNAME), which would look like punctuation. */
function shownValue(record: DnsRecord): string {
  return ['MX', 'NS', 'CNAME'].includes(record.type) ? record.data.replace(/\.$/, '') : record.data;
}

/** The priority of an MX (“5 gmail-smtp-in…” → 5): the mail server with the lowest is tried first. */
const priority = (record: DnsRecord) => Number.parseInt(record.data, 10) || 0;

/** The answer's values (without the CNAMEs, which are counted separately), at most three; MX by priority. */
function valuesLabel(records: DnsRecord[], t: Strings): string {
  const values = records.filter((record) => record.type !== 'CNAME');
  const sorted = [...values].sort((a, b) =>
    a.type === 'MX' && b.type === 'MX' ? priority(a) - priority(b) : 0,
  );
  const shown = sorted.map(shownValue);
  if (shown.length <= 3) return shown.join(', ');
  return fill(t.andMore, { first: shown.slice(0, 3).join(', '), n: shown.length - 3 });
}

export interface StepText {
  from: string;
  to: string;
  says: string;
}

/**
 * Who asks, whom and what they answer in a step of the path. `resolverAddress`: the resolver
 * that answered (8.8.8.8 if Cloudflare did not).
 */
export function stepText(
  step: PathStep,
  t: Strings,
  resolverAddress: string = RESOLVER.address,
): StepText {
  const resolver = fill(t.resolver, { address: resolverAddress });
  switch (step.kind) {
    case 'ask':
      return { from: t.you, to: resolver, says: fill(t.ask, { type: step.type, name: step.name }) };
    case 'referral':
      return {
        from: resolver,
        to: `${zoneLabel(step.zone.name, t)} (${serversLabel(step.zone.servers, t)})`,
        says: fill(t.referral, {
          next: zoneLabel(step.next.name, t),
          servers: serversLabel(step.next.servers, t),
        }),
      };
    case 'final': {
      const to = `${zoneLabel(step.zone.name, t)} (${serversLabel(step.zone.servers, t)})`;
      if (step.outcome === 'error') {
        return { from: resolver, to, says: fill(t.final.error, { code: step.status }) };
      }
      if (!step.alias) {
        const says =
          step.outcome === 'answer'
            ? fill(t.finalAnswer, { values: valuesLabel(step.records, t) })
            : fill(t.final[step.outcome], { type: step.type });
        return { from: resolver, to, says };
      }
      // With an alias: the server says so and, if the target is in its zone, also what is behind it.
      const { name, target, via } = step.alias;
      const alias =
        via.length > 0
          ? fill(t.aliasVia, { name, target, via: via.join(', ') })
          : fill(t.alias, { name, target });
      const hasValues = step.records.some((record) => record.type !== 'CNAME');
      const rest = step.leavesZone
        ? t.lookThere
        : step.outcome !== 'answer'
          ? fill(t.aliasOutcome[step.outcome], { target: step.alias.target, type: step.type })
          : hasValues
            ? fill(t.finalAnswer, { values: valuesLabel(step.records, t) })
            : '';
      return { from: resolver, to, says: [alias, rest].filter(Boolean).join(' ') };
    }
    case 'alias': {
      const values = valuesLabel(step.records, t);
      const answer = !step.chain
        ? fill(t.followAlias, { values })
        : step.chain.via.length > 0
          ? fill(t.followAliasChainVia, {
              target: step.chain.target,
              via: step.chain.via.join(', '),
              values,
            })
          : fill(t.followAliasChain, { target: step.chain.target, values });
      return {
        from: resolver,
        to: step.target,
        says:
          step.outcome === 'answer'
            ? answer
            : fill(t.followAliasOutcome[step.outcome === 'nxdomain' ? 'nxdomain' : 'nodata'], {
                type: step.type,
              }),
      };
    }
    case 'reply':
      return {
        from: resolver,
        to: t.you,
        says: fill(t.reply[step.outcome], {
          ttl: step.records.length > 0 ? minTtl(step.records) : 0,
          type: step.type,
          code: step.status,
        }),
      };
  }
}

/** A sentence with the result, to announce when the lookup finishes. */
export function summary(result: LookupResult, t: Strings): string {
  const template =
    result.outcome === 'answer' && result.records.length === 1
      ? t.summaryOne
      : t.summary[result.outcome];
  return fill(template, { n: result.records.length, type: result.type, code: result.status });
}
