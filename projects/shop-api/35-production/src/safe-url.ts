// Sending a request to a URL someone else has given, without them using it to reach where only the
// server reaches (SSRF, lesson 7): the database on localhost:5432, the company's internal network
// or the cloud's metadata at 169.254.169.254, which keep the server's credentials.
import { lookup } from 'node:dns/promises';
import { request as requestHttp, type IncomingMessage } from 'node:http';
import { request as requestHttps } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { config } from './config.ts';

export interface Address {
  address: string;
  family: number; // 4 or 6
}

// Who turns a name into addresses. The real one asks DNS; the tests use their own, so as not to
// leave the computer.
export type Resolver = (name: string) => Promise<Address[]>;
const dnsResolver: Resolver = (name) => lookup(name, { all: true });

export interface Options {
  resolver?: Resolver;
  // Names for which http and an internal address are allowed: only in development, to try with a
  // server on your computer. Unless something else is said, the ones in NOTIFICATION_DEV_HOSTS.
  devHosts?: string[];
}

// #region forbidden
// The addresses nothing is ever sent to: the ones that aren't the internet's, but the server's own
// or its network's. An IPv4 address written as IPv6 (::ffff:127.0.0.1) counts too: BlockList
// compares it with the IPv4 rules.
const FORBIDDEN = new BlockList();
FORBIDDEN.addSubnet('0.0.0.0', 8); // "this network"
FORBIDDEN.addSubnet('10.0.0.0', 8); // private
FORBIDDEN.addSubnet('100.64.0.0', 10); // shared by the carriers (CGNAT)
FORBIDDEN.addSubnet('127.0.0.0', 8); // loopback: the server itself
FORBIDDEN.addSubnet('169.254.0.0', 16); // link-local: the cloud's metadata is here
FORBIDDEN.addSubnet('172.16.0.0', 12); // private
FORBIDDEN.addSubnet('192.168.0.0', 16); // private
FORBIDDEN.addSubnet('192.0.0.0', 24); // reserved for protocols
FORBIDDEN.addSubnet('198.18.0.0', 15); // reserved for network testing
FORBIDDEN.addSubnet('224.0.0.0', 4); // multicast
FORBIDDEN.addSubnet('240.0.0.0', 4); // reserved, with 255.255.255.255
FORBIDDEN.addAddress('::', 'ipv6'); // "none"
FORBIDDEN.addAddress('::1', 'ipv6'); // loopback
FORBIDDEN.addSubnet('64:ff9b::', 96, 'ipv6'); // NAT64: an IPv4 hidden inside an IPv6
FORBIDDEN.addSubnet('fc00::', 7, 'ipv6'); // unique-local: IPv6's private ones
FORBIDDEN.addSubnet('fe80::', 10, 'ipv6'); // link-local
FORBIDDEN.addSubnet('ff00::', 8, 'ipv6'); // multicast
// #endregion forbidden

// #region check-url
// Checks the URL and returns the address to connect to, or the reason not to.
export async function checkUrl(
  text: string,
  options: Options = {},
): Promise<{ url: URL; address: Address } | { error: string }> {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: 'It is not a URL' };
  }
  if (url.username || url.password) {
    return { error: 'The URL cannot carry a user or a password' };
  }
  const name = url.hostname.replace(/^\[(.*)\]$/, '$1'); // an IPv6 goes in brackets: [::1]
  const forDevelopment = (options.devHosts ?? config.NOTIFICATION_DEV_HOSTS).includes(name);

  // 1. Only https: nobody on the way reads what travels. http, only in development.
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && forDevelopment)) {
    return { error: 'It has to start with https://' };
  }
  // 2. The name, turned into addresses (if it's already an address, that one).
  const family = isIP(name);
  const addresses =
    family !== 0
      ? [{ address: name, family }]
      : await (options.resolver ?? dnsResolver)(name).catch(() => []);
  if (addresses.length === 0) return { error: `${name} cannot be found` };
  // 3. None can be internal. Looking at the name isn't enough: anyone can create a name that
  //    points to 127.0.0.1. What counts is the address.
  if (!forDevelopment) {
    const internal = addresses.find((address) =>
      FORBIDDEN.check(address.address, address.family === 6 ? 'ipv6' : 'ipv4'),
    );
    if (internal) return { error: `It points to an internal address (${internal.address})` };
  }
  return { url, address: addresses[0]! };
}
// #endregion check-url

// #region send
const TIMEOUT = 5000; // ms
const MAX_SIZE = 64 * 1024; // bytes of response: no more is needed to know whether it arrived

// Sends a POST with a JSON body (already as text: that way the signature is of these exact bytes).
// Returns the response's status code, or the reason it wasn't sent or didn't arrive.
export async function postJson(
  text: string,
  body: string,
  headers: Record<string, string>,
  options: Options = {},
): Promise<{ status: number } | { error: string }> {
  const checked = await checkUrl(text, options);
  if ('error' in checked) return checked;
  const { url, address } = checked;

  // 4. It connects to the checked address, without asking DNS again: the second answer could be
  //    another one (127.0.0.1), and the check would have been for nothing (DNS rebinding).
  const withTheChecked = ((_name, dnsOptions, done) => {
    if (dnsOptions.all) done(null, [address]);
    else done(null, address.address, address.family);
  }) as LookupFunction;

  const request = url.protocol === 'https:' ? requestHttps : requestHttp;
  return new Promise((resolve) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        lookup: withTheChecked,
        timeout: TIMEOUT, // 5. If it doesn't answer in time, it's cut off
      },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        // 6. Redirects aren't followed: a 302 could lead to an internal address.
        if (status >= 300 && status < 400) {
          response.destroy();
          return resolve({ error: `It answers ${status}, a redirect: it is not followed` });
        }
        // 7. The response is read with a cap: one that never ends would keep the server waiting.
        let read = 0;
        response.on('data', (chunk: Buffer) => {
          read += chunk.length;
          if (read > MAX_SIZE) {
            response.destroy();
            resolve({ error: 'The response is too big' });
          }
        });
        response.on('end', () => resolve({ status }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('it does not answer in time')));
    req.on('error', (error) => resolve({ error: `It could not be sent: ${error.message}` }));
    req.end(body);
  });
}
// #endregion send
