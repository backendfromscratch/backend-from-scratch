/**
 * Respuestas reales de Cloudflare (DoH JSON), grabadas el 2026-10-03 para los tests:
 * así no hace falta red y los resultados no cambian. Clave: «nombre TIPO».
 */
export const recorded: Record<string, unknown> = {
  '. NS': {
    Status: 0,
    Answer: [
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'a.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'b.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'c.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'd.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'e.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'f.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'g.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'h.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'i.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'j.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'k.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'l.root-servers.net.',
      },
      {
        name: '',
        type: 2,
        TTL: 510821,
        data: 'm.root-servers.net.',
      },
    ],
  },
  'com NS': {
    Status: 0,
    Answer: [
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'a.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'b.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'c.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'd.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'e.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'f.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'g.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'h.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'i.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'j.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'k.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'l.gtld-servers.net.',
      },
      {
        name: 'com',
        type: 2,
        TTL: 171104,
        data: 'm.gtld-servers.net.',
      },
    ],
  },
  'example.com NS': {
    Status: 0,
    Answer: [
      {
        name: 'example.com',
        type: 2,
        TTL: 84457,
        data: 'hera.ns.cloudflare.com.',
      },
      {
        name: 'example.com',
        type: 2,
        TTL: 84457,
        data: 'elliott.ns.cloudflare.com.',
      },
    ],
  },
  'example.com A': {
    Status: 0,
    Answer: [
      {
        name: 'example.com',
        type: 1,
        TTL: 213,
        data: '172.66.147.243',
      },
      {
        name: 'example.com',
        type: 1,
        TTL: 213,
        data: '104.20.23.154',
      },
    ],
  },
  'github.com NS': {
    Status: 0,
    Answer: [
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns1.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns2.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns3.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns4.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-1283.awsdns-32.org.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-1707.awsdns-21.co.uk.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-421.awsdns-52.com.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-520.awsdns-01.net.',
      },
    ],
  },
  'www.github.com NS': {
    Status: 0,
    Answer: [
      {
        name: 'www.github.com',
        type: 5,
        TTL: 3600,
        data: 'github.com.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns1.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns2.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns3.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'dns4.p08.nsone.net.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-1283.awsdns-32.org.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-1707.awsdns-21.co.uk.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-421.awsdns-52.com.',
      },
      {
        name: 'github.com',
        type: 2,
        TTL: 900,
        data: 'ns-520.awsdns-01.net.',
      },
    ],
  },
  'www.github.com A': {
    Status: 0,
    Answer: [
      {
        name: 'www.github.com',
        type: 5,
        TTL: 3381,
        data: 'github.com.',
      },
      {
        name: 'github.com',
        type: 1,
        TTL: 60,
        data: '140.82.121.4',
      },
    ],
  },
  'gmail.com NS': {
    Status: 0,
    Answer: [
      {
        name: 'gmail.com',
        type: 2,
        TTL: 342615,
        data: 'ns3.google.com.',
      },
      {
        name: 'gmail.com',
        type: 2,
        TTL: 342615,
        data: 'ns4.google.com.',
      },
      {
        name: 'gmail.com',
        type: 2,
        TTL: 342615,
        data: 'ns2.google.com.',
      },
      {
        name: 'gmail.com',
        type: 2,
        TTL: 342615,
        data: 'ns1.google.com.',
      },
    ],
  },
  'gmail.com MX': {
    Status: 0,
    Answer: [
      {
        name: 'gmail.com',
        type: 15,
        TTL: 1318,
        data: '20 alt2.gmail-smtp-in.l.google.com.',
      },
      {
        name: 'gmail.com',
        type: 15,
        TTL: 1318,
        data: '30 alt3.gmail-smtp-in.l.google.com.',
      },
      {
        name: 'gmail.com',
        type: 15,
        TTL: 1318,
        data: '40 alt4.gmail-smtp-in.l.google.com.',
      },
      {
        name: 'gmail.com',
        type: 15,
        TTL: 1318,
        data: '5 gmail-smtp-in.l.google.com.',
      },
      {
        name: 'gmail.com',
        type: 15,
        TTL: 1318,
        data: '10 alt1.gmail-smtp-in.l.google.com.',
      },
    ],
  },
  'no-existe-backend-desde-cero.com NS': {
    Status: 3,
    Authority: [
      {
        name: 'com',
        type: 6,
        TTL: 900,
        data: 'a.gtld-servers.net. nstld.verisign-grs.com. 1791012734 1800 900 604800 900',
      },
    ],
  },
  'no-existe-backend-desde-cero.com A': {
    Status: 3,
    Authority: [
      {
        name: 'com',
        type: 6,
        TTL: 900,
        data: 'a.gtld-servers.net. nstld.verisign-grs.com. 1791012734 1800 900 604800 900',
      },
    ],
  },
  'github.com AAAA': {
    Status: 0,
    Authority: [
      {
        name: 'github.com',
        type: 6,
        TTL: 3322,
        data: 'dns1.p08.nsone.net. hostmaster.nsone.net. 1656468023 43200 7200 1209600 3600',
      },
    ],
  },
  'www.github.com AAAA': {
    Status: 0,
    Answer: [{ name: 'www.github.com', type: 5, TTL: 2802, data: 'github.com.' }],
    Authority: [
      {
        name: 'github.com',
        type: 6,
        TTL: 102,
        data: 'ns-1707.awsdns-21.co.uk. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400',
      },
    ],
  },
};
