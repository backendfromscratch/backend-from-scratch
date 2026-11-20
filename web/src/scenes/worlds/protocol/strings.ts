/**
 * The protocol world's labels in both languages (protocol.ts, Protocol.astro). The terminal's runs
 * are the lesson's own (`nc example.com 80`), the same in both languages, trimmed as its text trims them.
 */
import type { Locale } from '../../../lib/locales';

export type Run = 'none' | 'reply' | 'ok' | 'bad' | 'missing';

export interface ProtocolStrings {
  chrome: string;
  console: string;
  siteSub: string;
  rfc: string;
  rfc9110: string;
  rfc9112: string;
  impls: string;
  stack: string;
  text: string;
  binary: string;
  hello: string;
  /** What each protocol of the text's list is for. */
  uses: Record<'http' | 'dns' | 'tcp' | 'tls' | 'ssh' | 'smtp', string>;
  /** The terminal: the command of each run and what comes back. */
  cmd: Record<Run, string>;
  out: Record<Run, string>;
}

const request = (host: boolean, path = '/') =>
  `(printf 'GET ${path} HTTP/1.1\\r\\n${host ? 'Host: example.com\\r\\n' : ''}Connection: close\\r\\n\\r\\n'; sleep 3) | nc example.com 80`;
const page = '241\n<!doctype html>…<title>Example Domain</title>…\n0';
const runs = {
  cmd: (missing: string): Record<Run, string> => ({
    none: '',
    reply: 'nc -l 8080',
    ok: request(true),
    bad: request(false),
    missing: request(true, missing),
  }),
  out: (hello: string): Record<Run, string> => ({
    none: '',
    reply: `HTTP/1.1 200 OK\nContent-Type: text/plain; charset=utf-8\n\n${hello}`,
    ok: `HTTP/1.1 200 OK\nTransfer-Encoding: chunked\nServer: cloudflare\n…\n\n${page}`,
    bad: 'HTTP/1.1 400 Bad Request\nServer: cloudflare\nContent-Length: 155\n…\n\n<html>…<h1>400 Bad Request</h1>…</html>',
    missing: `HTTP/1.1 404 Not Found\nTransfer-Encoding: chunked\n…\n\n${page}`,
  }),
};

export const strings: Record<Locale, ProtocolStrings> = {
  es: {
    chrome: 'Chrome · lo hizo gente de Google',
    console: 'tu terminal',
    siteSub: 'detrás de Cloudflare',
    rfc: 'las reglas, escritas',
    rfc9110: 'qué significa cada cosa',
    rfc9112: 'cómo se escriben los mensajes',
    impls: 'implementaciones',
    stack: 'algunos protocolos',
    text: 'texto',
    binary: 'binario',
    hello: 'Hola desde mi servidor',
    uses: {
      http: 'páginas y APIs',
      dns: 'nombres → direcciones',
      tcp: 'datos completos y en orden',
      tls: 'cifrar la conexión',
      ssh: 'un servidor desde tu terminal',
      smtp: 'enviar correo',
    },
    cmd: runs.cmd('/no-existe'),
    out: runs.out('Hola desde mi servidor'),
  },
  en: {
    chrome: 'Chrome · made by people at Google',
    console: 'your terminal',
    siteSub: 'behind Cloudflare',
    rfc: 'the rules, written down',
    rfc9110: 'what each thing means',
    rfc9112: 'how messages are written',
    impls: 'implementations',
    stack: 'some protocols',
    text: 'text',
    binary: 'binary',
    hello: 'Hello from my server',
    uses: {
      http: 'pages and APIs',
      dns: 'names → addresses',
      tcp: 'data complete and in order',
      tls: 'encrypting the connection',
      ssh: 'a server from your terminal',
      smtp: 'sending email',
    },
    cmd: runs.cmd('/does-not-exist'),
    out: runs.out('Hello from my server'),
  },
};
