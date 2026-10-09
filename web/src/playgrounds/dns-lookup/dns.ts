/**
 * dns-lookup lab: the logic, without network or interface.
 *
 * Reads the DoH responses (DNS over HTTPS, in its JSON format), finds the zones between
 * the root and the looked-up name and tells the path a resolver takes to answer.
 * It knows nothing about React or languages: resolver.ts makes the lookups and strings.ts provides the sentences.
 * Spec: docs/specs/2026-10-02-site-and-phase-0-design.md (§6.4)
 */

/** The record types that can be requested in the lab. */
export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Numeric type codes (RFC 1035 and later) of the records that appear in the responses. */
const TYPE_NAMES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
};

export interface DnsRecord {
  name: string;
  type: string;
  /** Seconds left in the resolver's cache. */
  ttl: number;
  data: string;
}

/** The response code, by name: NOERROR, NXDOMAIN, SERVFAIL, REFUSED… (“RCODE9” if unusual). */
export type DnsStatus = string;

export interface DnsResponse {
  status: DnsStatus;
  answers: DnsRecord[];
}

/** A zone of the path: a level of the name tree with its own servers. */
export interface Zone {
  name: string;
  servers: string[];
}

export type Outcome = 'answer' | 'nodata' | 'nxdomain' | 'error';

export interface LookupResult {
  name: string;
  type: RecordType;
  outcome: Outcome;
  /** The final response code: with an error, it says which (SERVFAIL, REFUSED…). */
  status: DnsStatus;
  records: DnsRecord[];
  path: Zone[];
}

/** An alias (CNAME): the first name of the chain, the last target and those in between. */
export interface Alias {
  name: string;
  target: string;
  via: string[];
}

/** A step of the path, to tell it one at a time. */
export type PathStep =
  | { kind: 'ask'; name: string; type: RecordType }
  | { kind: 'referral'; zone: Zone; next: Zone }
  | {
      kind: 'final';
      zone: Zone;
      type: RecordType;
      outcome: Outcome;
      status: DnsStatus;
      records: DnsRecord[];
      alias: Alias | null;
      /** The alias points outside this zone: its server does not have the answer and the resolver looks it up separately. */
      leavesZone: boolean;
    }
  | {
      kind: 'alias';
      target: string;
      type: RecordType;
      outcome: Outcome;
      records: DnsRecord[];
      /** If the target is itself an alias: where the chain ends and what it passes through. */
      chain: { target: string; via: string[] } | null;
    }
  | { kind: 'reply'; type: RecordType; outcome: Outcome; status: DnsStatus; records: DnsRecord[] };

/** Lowercase and without the trailing dot. The root, which can arrive as “” or as “.”, is always “.”. */
export function normalizeName(name: string): string {
  const trimmed = name.trim().toLowerCase().replace(/\.$/, '');
  return trimmed === '' ? '.' : trimmed;
}

/** A label: letters, digits, hyphens and underscores (as in _dmarc), with no hyphen at the start or end. */
const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;

export type DomainResult =
  { ok: true; name: string } | { ok: false; reason: 'empty' | 'invalid' | 'ip' };

/** An IPv4 (four numbers) or an IPv6 (the URL gives it in brackets). */
const IP = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/** “2606:4700::1111” or “::1”: an IPv6 written without brackets, which would not be understood as a URL. */
function isBareIpv6(text: string): boolean {
  if (!text.includes(':') || !/^[0-9a-f:.]+$/i.test(text)) return false;
  try {
    new URL(`http://[${text}]`);
    return true;
  } catch {
    return false;
  }
}

/** What the reader types → a domain name, or why it is not one. */
export function parseDomain(input: string): DomainResult {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (isBareIpv6(text)) return { ok: false, reason: 'ip' };
  let host: string;
  try {
    // A whole URL (https://example.com/path) or a name with accents: URL gives the name in ASCII.
    host = new URL(text.includes('://') ? text : `http://${text}`).hostname;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  // An IP is not a name: DNS goes from names to IPs. Better to say so than to answer NXDOMAIN.
  if (IP.test(host)) return { ok: false, reason: 'ip' };
  const name = normalizeName(host);
  const valid =
    name !== '.' && name.length <= 253 && name.split('.').every((label) => LABEL.test(label));
  return valid ? { ok: true, name } : { ok: false, reason: 'invalid' };
}

/** Each suffix of the name, from the root down: «www.example.com» → «.», «com», «example.com», «www.example.com». */
export function suffixes(name: string): string[] {
  const labels = name.split('.');
  return ['.', ...labels.map((_, i) => labels.slice(labels.length - 1 - i).join('.'))];
}

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

function isDohAnswer(value: unknown): value is DohAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const answer = value as Record<string, unknown>;
  return (
    typeof answer.name === 'string' &&
    typeof answer.type === 'number' &&
    typeof answer.TTL === 'number' &&
    typeof answer.data === 'string'
  );
}

/** The response codes (RCODE, RFC 1035 and RFC 6895). */
const STATUS: Record<number, DnsStatus> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

/** A DoH response in JSON (Cloudflare or Google) → DnsResponse. Fails if it does not look like one. */
/**
 * A TXT can come in several chunks, which the reader joins. Cloudflare quotes each chunk
 * (“"v=DKIM1; p=MIIB" "IjAN"”) and Google gives them already joined and unquoted. Here they look the same with
 * both: joined and quoted, as dig shows them when there is a single chunk (the usual case).
 */
function txtData(data: string): string {
  const pieces = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, piece]) =>
    piece!.replace(/\\(["\\])/g, '$1'),
  );
  return `"${data.startsWith('"') ? pieces.join('') : data}"`;
}

export function parseDohJson(json: unknown): DnsResponse {
  if (typeof json !== 'object' || json === null) throw new Error('Unexpected DNS response');
  const { Status, Answer } = json as { Status?: unknown; Answer?: unknown };
  if (typeof Status !== 'number') throw new Error('Unexpected DNS response');
  const answers = (Array.isArray(Answer) ? Answer : []).filter(isDohAnswer).map((answer) => ({
    name: normalizeName(answer.name),
    type: TYPE_NAMES[answer.type] ?? `TYPE${answer.type}`,
    ttl: answer.TTL,
    data: answer.type === 16 ? txtData(answer.data) : answer.data,
  }));
  return { status: STATUS[Status] ?? `RCODE${Status}`, answers };
}

/**
 * A name is a zone if the NS lookup returns servers for that exact name.
 * (The one for www.github.com returns its CNAME and the NS of github.com: those do not count.)
 */
function zoneOf(name: string, ns: DnsResponse | undefined): Zone | null {
  const servers = (ns?.answers ?? [])
    .filter((record) => record.type === 'NS' && record.name === name)
    .map((record) => normalizeName(record.data))
    .sort();
  return servers.length > 0 ? { name, servers } : null;
}

/** The zones between the root and the name. `nsBySuffix` is in the order of `suffixes(name)`. */
export function buildPath(name: string, nsBySuffix: DnsResponse[]): Zone[] {
  return suffixes(name)
    .map((suffix, i) => zoneOf(suffix, nsBySuffix[i]))
    .filter((zone): zone is Zone => zone !== null);
}

/** The final response, with its path, as one of the four possible results. */
export function interpret(
  name: string,
  type: RecordType,
  final: DnsResponse,
  path: Zone[],
): LookupResult {
  const outcome: Outcome =
    final.status === 'NXDOMAIN'
      ? 'nxdomain'
      : final.status !== 'NOERROR'
        ? 'error'
        : // A CNAME with no records of the requested type behind it is not an answer: it is NODATA.
          final.answers.some((record) => record.type === type)
          ? 'answer'
          : 'nodata';
  return { name, type, outcome, status: final.status, records: final.answers, path };
}

interface AliasLink {
  name: string;
  target: string;
}

/** The CNAMEs of a response, in order: each name and where it points. */
function aliasLinks(records: DnsRecord[]): AliasLink[] {
  return records
    .filter((record) => record.type === 'CNAME')
    .map((record) => ({ name: record.name, target: normalizeName(record.data) }));
}

/** A chain of aliases as one alias: the first name, the last target and those in between. */
function chainOf(links: AliasLink[]): Alias | null {
  const first = links[0];
  const last = links[links.length - 1];
  if (!first || !last) return null;
  return {
    name: first.name,
    target: last.target,
    via: links.slice(0, -1).map((link) => link.target),
  };
}

const inZone = (name: string, zone: string) =>
  zone === '.' || name === zone || name.endsWith(`.${zone}`);

/**
 * The path told step by step: the question, one referral per zone, the final answer and the resolver's.
 * If the answer is an alias to another zone, there is one more step: the resolver looks up the target separately.
 */
export function explain(result: LookupResult): PathStep[] {
  const steps: PathStep[] = [{ kind: 'ask', name: result.name, type: result.type }];
  const links = aliasLinks(result.records);
  const targetRecords = result.records.filter((record) => record.type !== 'CNAME');
  result.path.forEach((zone, i) => {
    const next = result.path[i + 1];
    if (next) {
      steps.push({ kind: 'referral', zone, next });
      return;
    }
    // The zone's server only knows the aliases of its zone; the rest of the chain is found
    // by the resolver separately, when looking up the target.
    const known: AliasLink[] = [];
    for (const link of links) {
      if (!inZone(link.name, zone.name)) break;
      known.push(link);
    }
    const alias = chainOf(known);
    const leavesZone =
      alias !== null && result.outcome !== 'error' && !inZone(alias.target, zone.name);
    steps.push({
      kind: 'final',
      zone,
      type: result.type,
      outcome: result.outcome,
      status: result.status,
      records: result.records,
      alias,
      leavesZone,
    });
    if (alias && leavesZone) {
      steps.push({
        kind: 'alias',
        target: alias.target,
        type: result.type,
        outcome: result.outcome,
        records: targetRecords,
        chain: chainOf(links.slice(known.length)),
      });
    }
  });
  steps.push({
    kind: 'reply',
    type: result.type,
    outcome: result.outcome,
    status: result.status,
    records: result.records,
  });
  return steps;
}
