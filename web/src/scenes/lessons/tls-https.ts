/**
 * The scenes of «TLS y HTTPS» / "TLS and HTTPS" (translationKey tls-https), one per part of the
 * text, in the order of its <Scene id="…" /> cues: the café's wifi and the three needs, padlocks
 * and seals, one shared key, a key pair, the TLS 1.3 handshake, the certificate chain and its
 * checks, what HTTPS leaves visible, and the lesson's badssl.com sites (worlds/crypto/).
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { cryptoWorld, INITIAL, route, viaWifi, type CryptoState } from '../worlds/crypto/crypto';
import { strings } from '../worlds/crypto/strings';

type D = Director<CryptoState>;

const sight = (d: D, which: 'clear' | 'changed' | 'cipher' | 'key') =>
  strings[d.lang].sights[which];

const lesson: LessonModule<CryptoState> = {
  initial: INITIAL,
  worlds: [cryptoWorld],
  scenes: [
    {
      id: 'problem',
      view: 'cafe',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Tres problemas', en: 'Three problems' },
      start: () => ({}),
      end: () => ({ needs: 3, sees: 'changed' }),
      async play(d) {
        await d.wait(400);
        await d.fly(viaWifi(d, 'browser'), sight(d, 'clear'), 'http', { arrive: 'server' });
        d.set({ sees: 'clear', needs: 1 });
        await d.caption({
          es: 'Sin cifrar, cualquiera en la wifi de la cafetería puede leer tu tráfico',
          en: 'Unencrypted, anyone on the coffee shop’s Wi-Fi can read your traffic',
        });
        const [server, eve, browser] = viaWifi(d, 'server');
        await d.fly([server!, eve!], { es: 'la página', en: 'the page' }, 'http');
        d.set({ sees: 'changed' });
        await d.fly([eve!, browser!], sight(d, 'changed'), 'muted', { arrive: 'browser' });
        d.set({ needs: 2 });
        await d.caption({
          es: 'Y también cambiarlo, por ejemplo para meter un script en la página',
          en: 'And change it too, for example to slip a script into the page',
        });
        await d.note(
          d.pt('browser', 't'),
          { es: 'tubanco.com → IP falsa', en: 'yourbank.com → fake IP' },
          { where: 'above', look: 'tag', ttl: 1600 },
        );
        d.set({ needs: 3 });
        await d.caption({
          es: 'Y con una IP falsa, te conectas a otro servidor creyendo que es el de tu banco',
          en: 'And with a fake IP, you connect to another server thinking it’s your bank’s',
        });
        await d.caption(
          {
            es: 'Confidencialidad, integridad y autenticidad: TLS da las tres',
            en: 'Confidentiality, integrity and authenticity: TLS provides all three',
          },
          { chip: 'TLS', kind: 'tls' },
        );
        await d.caption({
          es: 'Y HTTP dentro de TLS es HTTPS',
          en: 'And HTTP inside TLS is HTTPS',
        });
      },
    },
    {
      id: 'analogy',
      view: 'analogy',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Candados y sellos', en: 'Padlocks and seals' },
      start: () => ({}),
      end: () => ({ lock: true, sealed: true, stamped: true }),
      async play(d) {
        await d.wait(400);
        d.glow('lockbox', 'tls');
        await d.caption({
          es: 'Repartes candados abiertos con tu nombre: son tu clave pública',
          en: 'You hand out open padlocks with your name: they’re your public key',
        });
        d.set({ lock: true });
        d.glow('#cr-box', 'tls');
        await d.caption({
          es: 'Cualquiera mete un mensaje en una caja y la cierra con uno',
          en: 'Anyone can put a message in a box and lock it with one',
        });
        d.glow('#cr-key', 'tls');
        await d.caption({
          es: 'Pero solo tu llave los abre: tu clave privada, que no das a nadie',
          en: 'But only your key opens them: your private key, which you give to no one',
        });
        d.set({ sealed: true });
        d.glow('seal', 'tls');
        await d.caption({
          es: 'Al revés: sellas una carta, y cualquiera comprueba con la foto que el sello es tuyo',
          en: 'The other way round: you seal a letter, and anyone checks the seal against the photo',
        });
        await d.caption({
          es: 'El sello no oculta la carta: es una firma digital',
          en: 'The seal doesn’t hide the letter: it’s a digital signature',
        });
        d.set({ stamped: true });
        d.glow('idcard', 'tls');
        await d.caption({
          es: 'Y el certificado, como un DNI: una autoridad dice de quién es el sello',
          en: 'And the certificate, like a passport: an authority says whose seal it is',
        });
      },
    },
    {
      id: 'symmetric',
      view: 'sym',
      kind: 'tls',
      chip: { es: 'una llave', en: 'one key' },
      title: { es: 'Una sola llave', en: 'One key' },
      start: () => ({ keys: true }),
      end: () => ({ keys: true, sees: 'key' }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Una sola clave, la misma en los dos lados, cifra y descifra',
          en: 'One key, the same on both sides, encrypts and decrypts',
        });
        await d.fly(viaWifi(d, 'browser'), sight(d, 'cipher'), 'tls', { arrive: 'server' });
        d.set({ sees: 'cipher' });
        await d.caption({
          es: 'Quien escucha solo ve datos sin sentido',
          en: 'Whoever is listening only sees meaningless data',
        });
        const [browser, eve, server] = viaWifi(d, 'browser');
        await d.fly([browser!, eve!], sight(d, 'cipher'), 'tls');
        await d.fly([eve!, server!], 'x7#kQ8…', 'muted');
        await d.note(
          server!,
          { es: '✗ etiqueta', en: '✗ tag' },
          { where: 'right', look: 'tag', ttl: 1600 },
        );
        await d.caption({
          es: 'Si alguien cambia un solo bit, la etiqueta no cuadra y la conexión se corta',
          en: 'If someone changes a single bit, the tag doesn’t match and the connection is cut',
        });
        await d.fly(viaWifi(d, 'browser'), sight(d, 'key'), 'tls', {
          icon: 'key',
          arrive: 'server',
        });
        d.set({ sees: 'key' });
        await d.caption({
          es: 'Pero ¿cómo se ponen de acuerdo en la clave? Si la envían, cualquiera la copia',
          en: 'But how do they agree on the key? If they send it, anyone can copy it',
        });
      },
    },
    {
      id: 'asymmetric',
      view: 'keys',
      kind: 'tls',
      chip: { es: 'dos llaves', en: 'two keys' },
      title: { es: 'Dos llaves', en: 'Two keys' },
      start: () => ({}),
      end: () => ({ pair: 4 }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Un par de claves que van juntas: una pública y una privada',
          en: 'A pair of keys that go together: one public and one private',
        });
        const step = async (pair: 1 | 2 | 3 | 4, text: Text) => {
          d.set({ pair });
          d.glow(`#cr-p-${pair}`, 'tls');
          await d.caption(text);
        };
        await step(1, {
          es: 'Para cifrar: cualquiera cifra con tu clave pública…',
          en: 'To encrypt: anyone encrypts with your public key…',
        });
        await step(2, {
          es: '…y solo tu clave privada lo descifra',
          en: '…and only your private key decrypts it',
        });
        await step(3, {
          es: 'Para firmar: tú firmas con tu clave privada…',
          en: 'To sign: you sign with your private key…',
        });
        await step(4, {
          es: '…y cualquiera comprueba la firma con tu clave pública',
          en: '…and anyone checks the signature with your public key',
        });
        await d.caption({
          es: 'Es lenta: TLS la usa para acordar la clave y demostrar quién es el servidor',
          en: 'It’s slow: TLS uses it to agree on the key and prove who the server is',
        });
      },
    },
    {
      id: 'handshake',
      view: 'tls',
      kind: 'tls',
      chip: { es: 'handshake', en: 'handshake' },
      title: { es: 'El handshake de TLS', en: 'The TLS handshake' },
      start: () => ({}),
      end: () => ({ keys: true, cert: true }),
      async play(d) {
        await d.wait(400);
        await d.fly(route(d, 'browser', 'server', -1.5), 'ClientHello', 'tls', {
          arrive: 'server',
          trail: { badge: '1' },
        });
        await d.caption({
          es: 'ClientHello: versiones, cifrados, su parte del intercambio de claves y el nombre (SNI)',
          en: 'ClientHello: versions, ciphers, its part of the key exchange and the name (SNI)',
        });
        await d.fly(route(d, 'server', 'browser', -0.5), 'ServerHello', 'tls', {
          arrive: 'browser',
          trail: { badge: '2' },
        });
        await d.caption({
          es: 'ServerHello: la parte del intercambio del servidor',
          en: 'ServerHello: the server’s part of the exchange',
        });
        d.set({ keys: true });
        d.glow('#cr-b-key', 'tls');
        d.glow('#cr-s-key', 'tls');
        await d.caption({
          es: 'Con su secreto y la parte del otro, los dos calculan la misma clave, que nunca viaja',
          en: 'With its secret and the other’s part, each side computes the same key, which never travels',
        });
        await d.fly(
          route(d, 'server', 'browser', 0.5),
          { es: 'certificado + firma + Finished', en: 'certificate + signature + Finished' },
          'tls',
          { arrive: 'browser', trail: { badge: '3' } },
        );
        d.set({ cert: true });
        await d.caption({
          es: 'El servidor envía su certificado y firma el handshake con su clave privada',
          en: 'The server sends its certificate and signs the handshake with its private key',
        });
        await d.fly(route(d, 'browser', 'server', 1.5), 'Finished', 'tls', {
          arrive: 'server',
          trail: { badge: '4' },
        });
        await d.caption({
          es: 'Finished: los dos confirman que han visto lo mismo',
          en: 'Finished: both confirm they’ve seen the same thing',
        });
        await d.fly(
          route(d, 'browser', 'server'),
          { es: 'GET / (cifrada)', en: 'GET / (encrypted)' },
          'tls',
          {
            small: true,
            arrive: 'server',
          },
        );
        await d.fly(
          route(d, 'server', 'browser'),
          { es: 'respuesta (cifrada)', en: 'response (encrypted)' },
          'tls',
          { small: true, arrive: 'browser' },
        );
        await d.caption({
          es: 'Desde aquí, todo va cifrado. Ha costado un viaje de ida y vuelta más que el de TCP',
          en: 'From here on, everything is encrypted. It cost one more round trip on top of TCP’s',
        });
      },
    },
    {
      id: 'certs',
      view: 'chain',
      kind: 'tls',
      chip: { es: 'cadena', en: 'chain' },
      title: { es: 'Certificados y autoridades', en: 'Certificates and authorities' },
      start: () => ({}),
      end: () => ({ checks: ['ok', 'ok', 'ok'] }),
      async play(d) {
        await d.wait(400);
        d.glow('#cr-c-site', 'tls');
        await d.caption({
          es: 'Un certificado dice: esta clave pública es de example.com, del 26 de septiembre al 25 de diciembre de 2026',
          en: 'A certificate says: this public key belongs to example.com, from September 26 to December 25, 2026',
        });
        d.glow('#cr-c-int', 'tls');
        await d.caption({ es: 'Lo firma una CA intermedia…', en: 'An intermediate CA signs it…' });
        d.glow('#cr-c-root', 'tls');
        await d.caption({
          es: '…y a esta, una CA raíz de la lista que trae tu navegador',
          en: '…and a root CA from your browser’s list signs that one',
        });
        d.set({ checks: ['ok', '', ''] });
        await d.caption({
          es: 'El navegador comprueba la cadena, hasta una raíz de confianza,',
          en: 'The browser checks the chain, up to a trusted root,',
        });
        d.set({ checks: ['ok', 'ok', ''] });
        await d.caption({
          es: 'el nombre, que el dominio esté en el certificado,',
          en: 'the name, that the domain is in the certificate,',
        });
        d.set({ checks: ['ok', 'ok', 'ok'] });
        await d.caption({
          es: 'y las fechas. Si falla cualquiera, verás un error en lugar de la web',
          en: 'and the dates. If any of them fails, you’ll see an error instead of the website',
        });
      },
    },
    {
      id: 'visible',
      view: 'visible',
      kind: 'tls',
      chip: { es: 'qué se ve', en: 'visible' },
      title: { es: 'Qué protege HTTPS y qué no', en: 'What HTTPS protects and what it doesn’t' },
      start: () => ({ keys: true, cert: true }),
      end: () => ({ keys: true, cert: true, sees: 'cipher' }),
      async play(d) {
        await d.wait(400);
        await d.fly(viaWifi(d, 'browser'), 'ClientHello · SNI', 'tls', { arrive: 'server' });
        d.set({ sees: 'sni' });
        d.glow('#cr-seen-shown', 'tls');
        await d.caption({
          es: 'El dominio casi siempre va sin cifrar, en el SNI del ClientHello y en la consulta DNS',
          en: 'The domain almost always travels unencrypted, in the ClientHello’s SNI and in the DNS query',
        });
        await d.caption({
          es: 'También se ven la IP de destino y cuánto y cuándo envías',
          en: 'The destination IP, and how much and when you send, are visible too',
        });
        await d.fly(viaWifi(d, 'browser'), sight(d, 'cipher'), 'tls', { arrive: 'server' });
        d.set({ sees: 'cipher' });
        d.glow('#cr-seen-covered', 'tls');
        await d.caption({
          es: 'La ruta, las cabeceras, las cookies y el contenido van cifrados',
          en: 'The path, the headers, the cookies and the content travel encrypted',
        });
        await d.caption({
          es: 'Y el candado no dice si el dominio es honrado: el phishing también tiene HTTPS',
          en: 'And the padlock doesn’t say whether the domain is honest: phishing has HTTPS too',
        });
      },
    },
    {
      id: 'try',
      view: 'bad',
      kind: 'tls',
      chip: { es: 'badssl', en: 'badssl' },
      title: { es: 'Certificados rotos', en: 'Broken certificates' },
      start: () => ({}),
      end: () => ({ tried: 4 }),
      async play(d) {
        await d.wait(400);
        const site = async (tried: 1 | 2 | 3 | 4, text: Text) => {
          d.set({ tried });
          d.glow(`#cr-site-${tried}`, 'tls');
          await d.caption(text);
        };
        await site(1, {
          es: 'example.com pasa las tres: la cadena, el nombre y las fechas',
          en: 'example.com passes all three: the chain, the name and the dates',
        });
        await site(2, {
          es: 'Caducado: la fecha de hoy está fuera de las del certificado',
          en: 'Expired: today’s date is outside the certificate’s dates',
        });
        await site(3, {
          es: 'Nombre equivocado: el certificado es válido, pero de otro dominio',
          en: 'Wrong name: the certificate is valid, but for another domain',
        });
        await site(4, {
          es: 'Autofirmado: lo firma su propio dueño, no una autoridad de confianza',
          en: 'Self-signed: its own owner signed it, not a trusted authority',
        });
        await d.caption({
          es: 'En los tres, curl se niega a seguir y no llega a enviar la petición HTTP',
          en: 'In all three, curl refuses to go on and never sends the HTTP request',
        });
      },
    },
  ],
};

export default lesson;
