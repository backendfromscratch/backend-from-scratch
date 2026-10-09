/** dns-lookup lab texts in both languages. The {like this} placeholders are filled by describe.ts. */
import type { Locale } from '../../lib/locales';
import type { Outcome } from './dns';
import type { LookupFailure } from './resolver';

export interface Strings {
  title: string;
  domainLabel: string;
  typeLabel: string;
  submit: string;
  idle: string;
  loading: string;
  errors: Record<'empty' | 'invalid' | 'ip' | LookupFailure, string>;
  /** Always visible: the path is reconstructed, not seen live, and 1.1.1.1 need not be yours. */
  honesty: string;
  stepsLabel: string;
  next: string;
  showAll: string;
  you: string;
  resolver: string;
  root: string;
  andMore: string;
  ask: string;
  referral: string;
  finalAnswer: string;
  alias: string;
  /** A chain of several aliases: the first, the last and those in between ({via}). */
  aliasVia: string;
  /** When the alias points to another zone: its server does not have the answer. */
  lookThere: string;
  /** The extra step in which the resolver looks up the alias target. */
  followAlias: string;
  /** The alias target is itself an alias (a chain that crosses zones). */
  followAliasChain: string;
  followAliasChainVia: string;
  /** The alias target does not exist or has no records of the requested type (within the same zone). */
  aliasOutcome: Record<'nxdomain' | 'nodata', string>;
  /** The same, when the resolver has to look up the target separately. */
  followAliasOutcome: Record<'nxdomain' | 'nodata', string>;
  final: Record<Exclude<Outcome, 'answer'>, string>;
  reply: Record<Outcome, string>;
  summary: Record<Outcome, string>;
  summaryOne: string;
  recordsTitle: string;
  columns: { name: string; type: string; ttl: string; data: string };
  quoteOpen: string;
  quoteClose: string;
}

const es: Strings = {
  title: 'laboratorio · consulta DNS',
  domainLabel: 'Dominio',
  typeLabel: 'Tipo de registro',
  submit: 'Consultar',
  idle: 'Escribe un dominio, elige el tipo de registro y pulsa «Consultar». La consulta es real.',
  loading: 'Preguntando a {resolver}…',
  errors: {
    empty: 'Escribe un dominio, por ejemplo example.com.',
    invalid: 'Eso no parece un nombre de dominio. Prueba con algo como example.com.',
    ip: 'Eso es una dirección IP, no un nombre: el DNS traduce nombres a IPs. Prueba con un dominio, como example.com.',
    offline: 'No hay conexión a internet: el navegador no puede llegar al resolver.',
    timeout: 'Ni 1.1.1.1 ni 8.8.8.8 han respondido a tiempo. Vuelve a intentarlo.',
    resolver:
      'Ni 1.1.1.1 ni 8.8.8.8 han dado una respuesta. Si estás en una red de empresa o de un centro educativo, puede que los bloquee: prueba desde otra red, o con dig en la terminal.',
  },
  honesty:
    'El resolver 1.1.1.1 (Cloudflare), o 8.8.8.8 (Google) si Cloudflare no responde, ya hizo este recorrido, o lo tenía en caché; no tiene por qué ser el que usa tu ordenador. Aquí lo reconstruimos preguntándole quién lleva cada nivel. dig +trace lo hace de verdad, servidor a servidor.',
  stepsLabel: 'El recorrido, paso a paso',
  next: 'Siguiente paso',
  showAll: 'Ver todo',
  you: 'Tu navegador',
  resolver: 'Resolver {address}',
  root: 'la raíz',
  andMore: '{first} y {n} más',
  ask: '¿Qué registros {type} tiene {name}?',
  referral: 'No lo sé, pero {next} lo llevan {servers}. Pregúntales a ellos.',
  finalAnswer: 'Respuesta: {values}.',
  alias: '{name} es un alias (CNAME) de {target}.',
  aliasVia: '{name} es un alias (CNAME) de {target}, pasando por {via}.',
  lookThere: 'Busca ese nombre.',
  followAlias:
    'Busco ese nombre aparte, con su propio recorrido si no lo tengo en caché. Respuesta: {values}.',
  followAliasChain:
    'Busco ese nombre aparte: es a su vez un alias (CNAME) de {target}. Respuesta: {values}.',
  followAliasChainVia:
    'Busco ese nombre aparte: es a su vez un alias (CNAME) de {target}, pasando por {via}. Respuesta: {values}.',
  aliasOutcome: {
    nxdomain: '{target} no existe (NXDOMAIN).',
    nodata: '{target} no tiene registros {type}.',
  },
  followAliasOutcome: {
    nxdomain: 'Busco ese nombre aparte: no existe (NXDOMAIN).',
    nodata: 'Busco ese nombre aparte: existe, pero no tiene registros {type}.',
  },
  final: {
    nxdomain: 'Ese nombre no existe (NXDOMAIN).',
    nodata: 'El nombre existe, pero no tiene registros {type}.',
    error:
      'Te derivo más abajo, pero desde ahí el resolver no ha conseguido una respuesta válida ({code}).',
  },
  reply: {
    answer:
      'Aquí tienes la respuesta. Le quedan {ttl} segundos en mi caché: hasta entonces se la daré a quien pregunte, sin consultar a nadie.',
    nxdomain: 'Ese nombre no existe. Lo apunto en mi caché un rato, por si vuelves a preguntar.',
    nodata: 'El nombre existe, pero no tiene registros {type}. También lo apunto en mi caché.',
    error: 'No he podido averiguarlo: un servidor del camino ha respondido con un error ({code}).',
  },
  summary: {
    answer: 'Respuesta: {n} registros. Recorre los pasos para ver cómo se ha encontrado.',
    nxdomain: 'Ese dominio no existe (NXDOMAIN). Recorre los pasos para ver quién lo dice.',
    nodata: 'El dominio existe, pero no tiene registros {type} (NODATA).',
    error: 'El resolver no ha podido responder ({code}).',
  },
  summaryOne: 'Respuesta: 1 registro. Recorre los pasos para ver cómo se ha encontrado.',
  recordsTitle: 'Registros',
  columns: { name: 'Nombre', type: 'Tipo', ttl: 'TTL (s)', data: 'Valor' },
  quoteOpen: '«',
  quoteClose: '»',
};

const en: Strings = {
  title: 'lab · DNS lookup',
  domainLabel: 'Domain',
  typeLabel: 'Record type',
  submit: 'Look up',
  idle: 'Type a domain, choose the record type and press “Look up”. The query is real.',
  loading: 'Asking {resolver}…',
  errors: {
    empty: 'Type a domain, for example example.com.',
    invalid: 'That doesn’t look like a domain name. Try something like example.com.',
    ip: 'That’s an IP address, not a name: DNS turns names into IPs. Try a domain, like example.com.',
    offline: 'There is no internet connection: the browser can’t reach the resolver.',
    timeout: 'Neither 1.1.1.1 nor 8.8.8.8 answered in time. Try again.',
    resolver:
      'Neither 1.1.1.1 nor 8.8.8.8 gave an answer. If you are on a work or school network, it may be blocking them: try another network, or dig in the terminal.',
  },
  honesty:
    'The 1.1.1.1 resolver (Cloudflare), or 8.8.8.8 (Google) if Cloudflare doesn’t answer, already made this trip, or had it cached; it may not be the one your computer uses. Here we rebuild the trip by asking it who runs each level. dig +trace does it for real, server by server.',
  stepsLabel: 'The trip, step by step',
  next: 'Next step',
  showAll: 'Show all',
  you: 'Your browser',
  resolver: 'Resolver {address}',
  root: 'the root',
  andMore: '{first} and {n} more',
  ask: 'Which {type} records does {name} have?',
  referral: 'I don’t know, but {next} is run by {servers}. Ask them.',
  finalAnswer: 'Here you go: {values}.',
  alias: '{name} is an alias (CNAME) for {target}.',
  aliasVia: '{name} is an alias (CNAME) for {target}, by way of {via}.',
  lookThere: 'Look that name up.',
  followAlias:
    'I look that name up separately, with its own trip if I don’t have it cached. Here you go: {values}.',
  followAliasChain:
    'I look that name up separately: it is itself an alias (CNAME) for {target}. Here you go: {values}.',
  followAliasChainVia:
    'I look that name up separately: it is itself an alias (CNAME) for {target}, by way of {via}. Here you go: {values}.',
  aliasOutcome: {
    nxdomain: '{target} doesn’t exist (NXDOMAIN).',
    nodata: '{target} has no {type} records.',
  },
  followAliasOutcome: {
    nxdomain: 'I look that name up separately: it doesn’t exist (NXDOMAIN).',
    nodata: 'I look that name up separately: it exists, but it has no {type} records.',
  },
  final: {
    nxdomain: 'That name doesn’t exist (NXDOMAIN).',
    nodata: 'The name exists, but it has no {type} records.',
    error:
      'I’d refer you further down, but from there the resolver couldn’t get a valid answer ({code}).',
  },
  reply: {
    answer:
      'Here is your answer. It has {ttl} seconds left in my cache: until then I’ll hand it out without asking anyone.',
    nxdomain:
      'That name doesn’t exist. I’ll keep a note of that in my cache for a while, in case you ask again.',
    nodata: 'The name exists, but it has no {type} records. I’ll cache that too.',
    error: 'I couldn’t find out: a server along the way answered with an error ({code}).',
  },
  summary: {
    answer: 'Answer: {n} records. Step through the trip to see how it was found.',
    nxdomain: 'That domain doesn’t exist (NXDOMAIN). Step through the trip to see who says so.',
    nodata: 'The domain exists, but it has no {type} records (NODATA).',
    error: 'The resolver couldn’t answer ({code}).',
  },
  summaryOne: 'Answer: 1 record. Step through the trip to see how it was found.',
  recordsTitle: 'Records',
  columns: { name: 'Name', type: 'Type', ttl: 'TTL (s)', data: 'Value' },
  quoteOpen: '“',
  quoteClose: '”',
};

export const strings: Record<Locale, Strings> = { es, en };
