/**
 * Laboratorio dns-lookup: la lógica, sin red ni interfaz.
 *
 * Lee las respuestas DoH (DNS sobre HTTPS, en su formato JSON), encuentra las zonas que hay entre
 * la raíz y el nombre consultado y cuenta el recorrido que hace un resolver para responder.
 * No sabe de React ni de idiomas: resolver.ts hace las consultas y strings.ts pone las frases.
 * Spec: docs/specs/2026-10-02-site-and-phase-0-design.md (§6.4)
 */

/** Los tipos de registro que se pueden pedir en el laboratorio. */
export const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Códigos numéricos de tipo (RFC 1035 y siguientes) de los registros que aparecen en las respuestas. */
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
  /** Segundos que le quedan en la caché del resolver. */
  ttl: number;
  data: string;
}

/** El código de la respuesta, por su nombre: NOERROR, NXDOMAIN, SERVFAIL, REFUSED… («RCODE9» si es raro). */
export type DnsStatus = string;

export interface DnsResponse {
  status: DnsStatus;
  answers: DnsRecord[];
}

/** Una zona del recorrido: un nivel del árbol de nombres con sus propios servidores. */
export interface Zone {
  name: string;
  servers: string[];
}

export type Outcome = 'answer' | 'nodata' | 'nxdomain' | 'error';

export interface LookupResult {
  name: string;
  type: RecordType;
  outcome: Outcome;
  /** El código de la respuesta final: con un error, dice cuál (SERVFAIL, REFUSED…). */
  status: DnsStatus;
  records: DnsRecord[];
  path: Zone[];
}

/** Un alias (CNAME): el primer nombre de la cadena, el último destino y los de en medio. */
export interface Alias {
  name: string;
  target: string;
  via: string[];
}

/** Un paso del recorrido, para contarlo de uno en uno. */
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
      /** El alias apunta fuera de esta zona: su servidor no tiene la respuesta y el resolver la busca aparte. */
      leavesZone: boolean;
    }
  | {
      kind: 'alias';
      target: string;
      type: RecordType;
      outcome: Outcome;
      records: DnsRecord[];
      /** Si el destino es a su vez un alias: adónde llega la cadena y por dónde pasa. */
      chain: { target: string; via: string[] } | null;
    }
  | { kind: 'reply'; type: RecordType; outcome: Outcome; status: DnsStatus; records: DnsRecord[] };

/** Minúsculas y sin el punto final. La raíz, que puede llegar como «» o como «.», es siempre «.». */
export function normalizeName(name: string): string {
  const trimmed = name.trim().toLowerCase().replace(/\.$/, '');
  return trimmed === '' ? '.' : trimmed;
}

/** Una etiqueta: letras, cifras, guiones y guiones bajos (como en _dmarc), sin guion al principio ni al final. */
const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;

export type DomainResult =
  { ok: true; name: string } | { ok: false; reason: 'empty' | 'invalid' | 'ip' };

/** Una IPv4 (cuatro números) o una IPv6 (la URL la da entre corchetes). */
const IP = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/** «2606:4700::1111» o «::1»: una IPv6 escrita sin corchetes, que como URL no se entendería. */
function isBareIpv6(text: string): boolean {
  if (!text.includes(':') || !/^[0-9a-f:.]+$/i.test(text)) return false;
  try {
    new URL(`http://[${text}]`);
    return true;
  } catch {
    return false;
  }
}

/** Lo que escribe el lector → un nombre de dominio, o por qué no lo es. */
export function parseDomain(input: string): DomainResult {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (isBareIpv6(text)) return { ok: false, reason: 'ip' };
  let host: string;
  try {
    // Una URL entera (https://example.com/ruta) o un nombre con tildes: URL da el nombre en ASCII.
    host = new URL(text.includes('://') ? text : `http://${text}`).hostname;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  // Una IP no es un nombre: el DNS va de nombres a IPs. Mejor decirlo que responder NXDOMAIN.
  if (IP.test(host)) return { ok: false, reason: 'ip' };
  const name = normalizeName(host);
  const valid =
    name !== '.' && name.length <= 253 && name.split('.').every((label) => LABEL.test(label));
  return valid ? { ok: true, name } : { ok: false, reason: 'invalid' };
}

/** Cada sufijo del nombre, de la raíz hacia abajo: «www.example.com» → «.», «com», «example.com», «www.example.com». */
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

/** Los códigos de respuesta (RCODE, RFC 1035 y RFC 6895). */
const STATUS: Record<number, DnsStatus> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

/** Una respuesta DoH en JSON (Cloudflare o Google) → DnsResponse. Falla si no lo parece. */
/**
 * Un TXT puede ir en varios trozos, que quien lo lee une. Cloudflare entrecomilla cada trozo
 * («"v=DKIM1; p=MIIB" "IjAN"») y Google los da ya unidos y sin comillas. Aquí se ven igual con los
 * dos: unidos y entre comillas, como los enseña dig cuando hay un solo trozo (lo normal).
 */
function txtData(data: string): string {
  const pieces = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, piece]) =>
    piece!.replace(/\\(["\\])/g, '$1'),
  );
  return `"${data.startsWith('"') ? pieces.join('') : data}"`;
}

export function parseDohJson(json: unknown): DnsResponse {
  if (typeof json !== 'object' || json === null) throw new Error('Respuesta DNS inesperada');
  const { Status, Answer } = json as { Status?: unknown; Answer?: unknown };
  if (typeof Status !== 'number') throw new Error('Respuesta DNS inesperada');
  const answers = (Array.isArray(Answer) ? Answer : []).filter(isDohAnswer).map((answer) => ({
    name: normalizeName(answer.name),
    type: TYPE_NAMES[answer.type] ?? `TYPE${answer.type}`,
    ttl: answer.TTL,
    data: answer.type === 16 ? txtData(answer.data) : answer.data,
  }));
  return { status: STATUS[Status] ?? `RCODE${Status}`, answers };
}

/**
 * Un nombre es una zona si la consulta NS devuelve servidores para ese nombre exacto.
 * (La de www.github.com devuelve su CNAME y los NS de github.com: esos no cuentan.)
 */
function zoneOf(name: string, ns: DnsResponse | undefined): Zone | null {
  const servers = (ns?.answers ?? [])
    .filter((record) => record.type === 'NS' && record.name === name)
    .map((record) => normalizeName(record.data))
    .sort();
  return servers.length > 0 ? { name, servers } : null;
}

/** Las zonas entre la raíz y el nombre. `nsBySuffix` va en el orden de `suffixes(name)`. */
export function buildPath(name: string, nsBySuffix: DnsResponse[]): Zone[] {
  return suffixes(name)
    .map((suffix, i) => zoneOf(suffix, nsBySuffix[i]))
    .filter((zone): zone is Zone => zone !== null);
}

/** La respuesta final, con su recorrido, en uno de los cuatro resultados posibles. */
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
        : // Un CNAME sin registros del tipo pedido detrás no es una respuesta: es NODATA.
          final.answers.some((record) => record.type === type)
          ? 'answer'
          : 'nodata';
  return { name, type, outcome, status: final.status, records: final.answers, path };
}

interface AliasLink {
  name: string;
  target: string;
}

/** Los CNAME de una respuesta, en orden: cada nombre y adónde apunta. */
function aliasLinks(records: DnsRecord[]): AliasLink[] {
  return records
    .filter((record) => record.type === 'CNAME')
    .map((record) => ({ name: record.name, target: normalizeName(record.data) }));
}

/** Una cadena de alias como alias: el primer nombre, el último destino y los de en medio. */
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
 * El recorrido contado paso a paso: la pregunta, una derivación por zona, la respuesta final y la del resolver.
 * Si la respuesta es un alias a otra zona, hay un paso más: el resolver busca el destino aparte.
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
    // El servidor de la zona solo conoce los alias de su zona; el resto de la cadena lo encuentra
    // el resolver aparte, al buscar el destino.
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
