# Plan de implementación: contenido de la Fase 0 para buscadores y para todos los públicos

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** el contenido de la Fase 0 cumple dos cosas:
- **responde a lo que la gente busca en Google:** títulos, descripciones y la frase destacada de cada lección;
- **lo entiende cualquiera, sin saber programar:** la portada, la introducción y las 8 lecciones, en español y en inglés.

**Arquitectura:**
- **Reglas nuevas en la auditoría SEO del build:** la longitud del título y de la descripción.
- **El texto lo cambian scripts,** a partir de datos ya validados:
  - una tabla de títulos y descripciones en este plan;
  - ficheros JSON con las ediciones exactas de cada lección (`docs/plans/2026-10-03-contenido-fase-0/ediciones/`), que se revisan en `cambios.md`.
- **El explorador no cambia:** cada lección guarda su nombre corto en `sidebar.label`, así que los nombres de fichero del explorador y la paginación siguen igual.

**Stack:** Astro 7 + Starlight, MDX, Vitest y la auditoría SEO de `web/src/lib/seo/`.

**Spec:** `docs/specs/2026-10-03-seo-design.md`, §2.3 (público) y §4 (títulos). Guía: `docs/style-guide.md` («Escribe para todos los públicos», «Ya lo has visto»).

## Restricciones globales

**Forma de trabajar**
- **Sin commits:** el autor no quiere commits. Cada tarea termina con la verificación.
- **Comandos,** desde la raíz del repo:

  | Para qué | Comando |
  |---|---|
  | Un fichero de tests | `pnpm --filter web exec vitest run <ruta desde web/>` |
  | Todos los tests | `pnpm test` |
  | Tipos | `pnpm check` |
  | Formato | `pnpm format:check` |
  | Build (incluye la auditoría SEO) | `pnpm build` |

- **Los scripts de un solo uso** de este plan se ejecutan desde la raíz y no se guardan en el repo.

**Límites de texto**
- **Longitudes:** el `<title>` completo (título más «| nombre de la web») tiene como mucho 70 caracteres. La descripción tiene entre 70 y 155. Las tildes cuentan como un carácter.
- **Lectura:** ninguna lección pasa de 15 minutos (`readingMinutes` redondea; 15,4 se muestra como 15).

**Qué se toca y qué no**
- **Rutas, `translationKey`, componentes, salidas de terminal, bloques de código e ids de `<Term>`:** no se tocan.
- **Fórmula de «Ya lo has visto»:** lo que ve cualquiera va primero. Si hay puntos para quien programa, van después de una línea suelta «Y si programas:» («And if you code:»), con un matiz opcional: «Y si programas, en DevTools:».
- **El español es el original;** cada cambio tiene su equivalente en inglés.

## Review Focus

1. **Una edición que ya no encuentra su texto,** porque alguien tocó la lección después de este plan. Esperado: el script se para sin escribir nada y dice qué texto falta, en lugar de aplicar la mitad. Test: el script de la Tarea 4 comprueba todas las ediciones de una lección antes de escribir, y su paso 2 provoca el fallo a propósito.
2. **Un título nuevo con «:» o comillas** que rompa el YAML del frontmatter. Esperado: los valores se escriben entrecomillados (JSON es YAML válido). Test: el build de la Tarea 2 y la comprobación de que el H1 muestra el título nuevo.
3. **Los nombres del explorador,** que salen de la etiqueta del sidebar. Esperado: `06-dns.md` sigue siendo `06-dns.md` aunque el título pase a ser «Qué es el DNS y cómo funciona». Test: la comprobación del explorador en la Tarea 2.
4. **Una lección que pase de 15 minutos de lectura** por las explicaciones añadidas. Esperado: ninguna lo hace. Test: la medida del paso de verificación de las Tareas 4 a 7.
5. **El inglés y el español desincronizados.** Esperado: cada JSON trae los cambios de las dos versiones, y la auditoría sigue validando `hreflang` y selector. Test: el build de cada tarea.

## Estructura de ficheros

- **Modificar:**
  - `web/src/lib/seo/audit.ts` y su test;
  - el frontmatter de las 18 páginas de contenido (portadas, introducciones de fase y lecciones, en los dos idiomas);
  - el cuerpo de las portadas, de las introducciones de la Fase 0 y de las 16 lecciones.
- **Datos, ya escritos:**
  - `docs/plans/2026-10-03-contenido-fase-0/ediciones/<lección>.json`: las ediciones exactas, español e inglés;
  - `docs/plans/2026-10-03-contenido-fase-0/cambios.md`: los mismos cambios en español, con el antes y el después, para revisarlos.
- **Documentación:** `docs/style-guide.md`, `docs/pendientes.md` y `docs/specs/2026-10-03-seo-design.md`.

---

### Tarea 1: Reglas de longitud del título y de la descripción

**Ficheros:**
- Modificar: `web/src/lib/seo/audit.ts`
- Test: `web/src/lib/seo/audit.test.ts`

**Interfaces:**
- Consume: `perPage`, `defaultRules` y los helpers `page` e `input` del test (del plan de SEO técnico).
- Produce: `TITLE_MAX`, `DESCRIPTION_MIN`, `DESCRIPTION_MAX`, y las reglas `titleLength` y `descriptionLength`, al final de `defaultRules`.

- [ ] **Paso 1: tests**

Añade `DESCRIPTION_MAX`, `DESCRIPTION_MIN`, `descriptionLength`, `TITLE_MAX` y `titleLength` al import de `./audit`, y estos bloques al final de `audit.test.ts`:

```ts
describe('titleLength', () => {
  it('el <title> no pasa de 70 caracteres; una tilde cuenta como uno', () => {
    expect(TITLE_MAX).toBe(70);
    expect(titleLength(input([page('/', { title: 'á'.repeat(70) })]))).toEqual([]);
    expect(titleLength(input([page('/a/', { title: 'x'.repeat(71) })]))[0]?.message).toMatch(
      /71 caracteres/,
    );
  });
});

describe('descriptionLength', () => {
  it('la descripción tiene entre 70 y 155 caracteres', () => {
    expect([DESCRIPTION_MIN, DESCRIPTION_MAX]).toEqual([70, 155]);
    const ok = [page('/', { description: 'é'.repeat(155) }), page('/b/', { description: 'x'.repeat(70) })];
    expect(descriptionLength(input(ok))).toEqual([]);
    const wrong = [page('/a/', { description: 'x'.repeat(156) }), page('/c/', { description: 'x'.repeat(69) })];
    expect(descriptionLength(input(wrong)).map((i) => i.url)).toEqual(['/a/', '/c/']);
  });

  it('sin descripción no avisa: eso ya lo dice titleAndDescription', () => {
    expect(descriptionLength(input([page('/', { description: undefined })]))).toEqual([]);
  });
});
```

En el test «defaultRules son las reglas de la web», añade `titleLength, descriptionLength` al final de la lista esperada.

- [ ] **Paso 2: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: FAIL, con `titleLength is not a function` (y la lista de `defaultRules`).

- [ ] **Paso 3: implementar**

En `audit.ts`, antes de `defaultRules`:

```ts
/** Google corta el título hacia los 60-70 caracteres y la descripción hacia los 155. */
export const TITLE_MAX = 70;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 155;

/** Caracteres, no unidades UTF-16: una tilde cuenta como uno. */
const length = (text: string) => [...text].length;

export const titleLength = perPage('title-length', ({ facts }) => {
  const n = length(facts.title ?? '');
  return n > TITLE_MAX
    ? `el <title> tiene ${n} caracteres; Google lo corta a partir de unos ${TITLE_MAX}`
    : undefined;
});

export const descriptionLength = perPage('description-length', ({ facts }) => {
  if (!facts.description) return undefined;
  const n = length(facts.description);
  if (n > DESCRIPTION_MAX) {
    return `la descripción tiene ${n} caracteres; Google la corta a partir de unos ${DESCRIPTION_MAX}`;
  }
  if (n < DESCRIPTION_MIN) {
    return `la descripción tiene ${n} caracteres; aprovecha hasta ${DESCRIPTION_MAX} para decir de qué va la página`;
  }
  return undefined;
});
```

Y añade `titleLength, descriptionLength` al final de `defaultRules`.

- [ ] **Paso 4: tests y build (en rojo)**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts && pnpm build`
Expected:
- **tests:** PASS;
- **build:** FAIL, con 11 `[description-length]` (6 en español y 5 en inglés: las descripciones de 157 a 181 caracteres) y ningún `[title-length]`.

Sin commit.

---

### Tarea 2: Títulos, etiquetas, descripciones y frases destacadas

**Ficheros:**
- Modificar el frontmatter de:
  - `web/src/content/docs/{index,fase-0/index}.mdx` y `web/src/content/docs/en/{index,phase-0/index}.mdx`;
  - las 8 lecciones de `fase-0/` y las 8 de `en/phase-0/`.

**Interfaces:**
- Consume: las reglas de la Tarea 1.
- Produce:
  - el `title` nuevo (H1, `<title>`, migas en JSON-LD e imagen para redes);
  - `sidebar.label`, con el título corto de antes, que es lo que usan el explorador, la paginación y los requisitos;
  - el `description` nuevo;
  - el `oneLiner` nuevo en las lecciones 2, 3 y 8.

La frase destacada (`lesson.oneLiner`) es el primer texto bajo el H1, así que hace de «primer párrafo que responde la pregunta del título» (spec §4). En las lecciones 1 y 4 a 7 ya responde, y no se toca. Los párrafos narrativos que siguen son la voz del autor: tampoco se tocan.

- [ ] **Paso 1: aplicar con un script**

Desde la raíz del repo:

```python
import json, re
from pathlib import Path

D = Path('web/src/content/docs')
# fichero: (título nuevo o None, descripción nueva, etiqueta corta esperada o None, oneLiner nuevo o None)
PAGES = {
  'index.mdx': (None, 'Curso gratis para aprender backend desde cero: cómo funciona internet, servidores, APIs, bases de datos, despliegue e IA. Explicado para cualquiera.', None, None),
  'en/index.mdx': (None, 'A free course to learn backend development from scratch: how the internet works, servers, APIs, databases, deployment and AI. Explained for anyone.', None, None),
  'fase-0/index.mdx': ('Cómo funciona internet: la base del backend', 'Cómo funciona internet explicado desde cero: cliente y servidor, protocolos, capas de red, IP, TCP y UDP, DNS y HTTPS, con ejercicios reales.', None, None),
  'en/phase-0/index.mdx': ('How the internet works: backend foundations', 'How the internet works, explained from scratch: client and server, protocols, network layers, IP, TCP and UDP, DNS and HTTPS, with real exercises.', None, None),
  'fase-0/modelo-cliente-servidor.mdx': ('Modelo cliente-servidor: qué es y cómo funciona', 'Qué es el modelo cliente-servidor y por qué un servidor no es más que un programa que espera peticiones. Con un servidor que montas en un minuto.', 'Modelo cliente-servidor', None),
  'en/phase-0/client-server-model.mdx': ('The client-server model, explained', 'What the client-server model is and why a server is just a program waiting for requests. With a server you can start yourself in a minute.', 'The client-server model', None),
  'fase-0/que-es-un-protocolo.mdx': ('Qué es un protocolo de red', 'Qué es un protocolo de red y por qué dos programas que no se conocen se entienden. Lo verás hablando HTTP a mano con un servidor real.', 'Qué es un protocolo', 'Un protocolo de red es un acuerdo sobre qué mensajes se envían, con qué formato y en qué orden. Si los dos lados lo cumplen, se entienden sin conocerse.'),
  'en/phase-0/what-is-a-protocol.mdx': ('What is a network protocol?', 'What a network protocol is and why two programs that have never met can understand each other. See it by speaking HTTP by hand to a real server.', 'What a protocol is', 'A network protocol is an agreement on which messages are sent, in what format and in what order. If both sides follow it, they understand each other without ever having met.'),
  'fase-0/modelo-tcp-ip.mdx': ('El modelo TCP/IP y sus capas (y el modelo OSI)', 'Qué son las capas del modelo TCP/IP, qué hace cada una y en qué se diferencia del modelo OSI, explicado con sobres dentro de sobres.', 'El modelo TCP/IP', 'El modelo TCP/IP reparte el trabajo de internet en capas: cada protocolo resuelve un solo problema y se apoya en el de abajo, como sobres dentro de sobres.'),
  'en/phase-0/tcp-ip-model.mdx': ('The TCP/IP model and its layers (vs. OSI)', 'What the layers of the TCP/IP model are, what each one does and how it compares to the OSI model, explained with envelopes inside envelopes.', 'The TCP/IP model', 'The TCP/IP model splits the work of the internet into layers: each protocol solves a single problem and relies on the one below, like envelopes inside envelopes.'),
  'fase-0/ip-puertos-y-sockets.mdx': ('IP, puertos y sockets: qué son y cómo funcionan', 'Qué es una dirección IP, en qué se diferencian las públicas y las privadas, qué hacen NAT y los routers, y qué son los puertos y los sockets.', 'IP, puertos y sockets', None),
  'en/phase-0/ip-ports-sockets.mdx': ('IP addresses, ports and sockets explained', 'What an IP address is, public vs. private addresses, what NAT and routers do, and what ports and sockets are, with exercises in your terminal.', 'IP, ports and sockets', None),
  'fase-0/tcp-vs-udp.mdx': ('Diferencia entre TCP y UDP', 'Diferencia entre TCP y UDP: cómo consigue TCP que los datos lleguen completos y en orden, qué es el handshake y cuándo conviene UDP.', 'TCP frente a UDP', None),
  'en/phase-0/tcp-vs-udp.mdx': ("TCP vs UDP: what's the difference?", 'The difference between TCP and UDP: how TCP gets data there complete and in order, what the handshake is, and when UDP is the better choice.', 'TCP vs UDP', None),
  'fase-0/que-es-dns.mdx': ('Qué es el DNS y cómo funciona', 'Qué es el DNS y cómo convierte un nombre como example.com en una IP: servidores raíz, resolver, caché, registros A, CNAME y MX, y el TTL.', 'DNS', None),
  'en/phase-0/what-is-dns.mdx': ('What is DNS and how does it work?', 'What DNS is and how it turns a name like example.com into an IP address: root servers, the resolver, caching, A, CNAME and MX records, and TTL.', 'DNS', None),
  'fase-0/tls-y-https.mdx': ('Qué es TLS y cómo funciona HTTPS', 'Qué protege el candado del navegador: cómo funciona HTTPS, qué es TLS, la criptografía de clave pública y los certificados, paso a paso.', 'TLS y HTTPS', None),
  'en/phase-0/tls-and-https.mdx': ('What is TLS and how does HTTPS work?', 'What the browser padlock protects: how HTTPS works, what TLS is, public-key cryptography and certificates, step by step.', 'TLS and HTTPS', None),
  'fase-0/que-pasa-cuando-escribes-una-url.mdx': ('Qué pasa cuando escribes una URL en el navegador', 'Qué pasa desde que escribes una URL y pulsas Enter hasta que ves la página: DNS, TCP, TLS y HTTP, paso a paso y con lo que tarda cada uno.', 'De la URL a la página', 'Cuando escribes una URL y pulsas Enter, el navegador busca la IP del servidor (DNS), abre una conexión (TCP), la cifra (TLS), pide la página (HTTP) y la dibuja. Casi cada paso cuesta un viaje de ida y vuelta, y por eso la distancia importa.'),
  'en/phase-0/what-happens-when-you-type-a-url.mdx': ('What happens when you type a URL in the browser', 'What happens from the moment you type a URL and press Enter until the page appears: DNS, TCP, TLS and HTTP, step by step, with how long each takes.', 'From URL to page', 'When you type a URL and press Enter, the browser looks up the server\'s IP (DNS), opens a connection (TCP), encrypts it (TLS), requests the page (HTTP) and draws it. Almost every step costs a round trip, which is why distance matters.'),
}
q = lambda value: json.dumps(value, ensure_ascii=False)  # JSON entrecomillado es YAML válido

def set_line(fm, key, value, indent=''):
    pattern = rf'^{indent}{key}: .*$'
    assert len(re.findall(pattern, fm, re.M)) == 1, (key, fm[:80])
    return re.sub(pattern, lambda _: f'{indent}{key}: {q(value)}', fm, count=1, flags=re.M)

for name, (title, description, label, one_liner) in PAGES.items():
    path = D / name
    _, fm, body = path.read_text().split('---', 2)
    if label is not None:
        current = re.search(r'^title: (.*)$', fm, re.M).group(1).strip().strip("'\"")
        assert current == label, (name, current, label)  # la etiqueta corta es el título de antes
        assert re.search(r'^sidebar:\n', fm, re.M) and not re.search(r'^  label:', fm, re.M), name
        fm = re.sub(r'^sidebar:\n', lambda _: f'sidebar:\n  label: {q(label)}\n', fm, count=1, flags=re.M)
    if title is not None:
        fm = set_line(fm, 'title', title)
    fm = set_line(fm, 'description', description)
    if one_liner is not None:
        fm = set_line(fm, 'oneLiner', one_liner, indent='  ')
    path.write_text(f'---{fm}---{body}')
    print('ok', name)
```

Expected: 20 líneas `ok …`.

- [ ] **Paso 2: build**

Run: `pnpm build`
Expected:
- `[seo-audit] 24 páginas auditadas, sin problemas.`: ya no queda ningún `[description-length]`, y ningún título pasa de 70;
- `All internal links are valid.`.

- [ ] **Paso 3: comprobar el resultado**

Run, desde la raíz:

```sh
grep -o '<title>[^<]*' web/dist/fase-0/que-es-dns/index.html web/dist/en/phase-0/what-is-dns/index.html
grep -o '<h1[^>]*>[^<]*' web/dist/fase-0/que-es-dns/index.html
grep -o 'explorer__file[^>]*>[^<]*' web/dist/fase-0/que-es-dns/index.html | sed 's/.*>//' | tr '\n' ' '
```

Expected:
- **títulos:** `Qué es el DNS y cómo funciona | Backend desde cero` y `What is DNS and how does it work? | Backend from Scratch`;
- **H1:** `Qué es el DNS y cómo funciona`;
- **explorador, igual que antes:** `README.md roadmap.md glosario.md 00-introduccion.md 01-modelo-cliente-servidor.md 02-que-es-un-protocolo.md 03-el-modelo-tcp-ip.md 04-ip-puertos-y-sockets.md 05-tcp-frente-a-udp.md 06-dns.md 07-tls-y-https.md 08-de-la-url-a-la-pagina.md`.

Abre `web/dist/og/fase-0/que-pasa-cuando-escribes-una-url.png` con la herramienta de lectura de imágenes. Esperado: el título largo, en dos líneas y sin salirse de la tarjeta.

- [ ] **Paso 4: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 3: La portada y la introducción de la Fase 0, para todos los públicos

**Ficheros:**
- Modificar: `web/src/content/docs/index.mdx`, `web/src/content/docs/en/index.mdx`, `web/src/content/docs/fase-0/index.mdx` y `web/src/content/docs/en/phase-0/index.mdx`

- [ ] **Paso 1: aplicar**

Desde la raíz:

```python
from pathlib import Path

D = Path('web/src/content/docs')
EDITS = {
  'index.mdx': [
    ('Un curso gratuito para aprender lo que pasa detrás de cada petición, de los cables de internet a los agentes de IA. Para quien ya programa (por ejemplo, en frontend) pero nunca ha estado al otro lado del servidor. No explicamos qué es una variable, pero sí qué es un puerto.',
     'Un curso gratuito para aprender backend desde cero: lo que pasa detrás de cada web y cada app, de los cables de internet a los agentes de IA. Es para cualquiera: no hace falta saber backend ni programar para empezar, porque cada concepto se explica desde el principio, con ejemplos que puedes probar tú.'),
    ('como una consola SQL o criptografía en tu navegador.', 'como una base de datos o criptografía de verdad, en tu navegador.'),
  ],
  'en/index.mdx': [
    ('A free course to learn what happens behind every request, from the wires of the internet to AI agents. For people who already code (for example, on the frontend) but have never been on the other side of the server. We won\'t explain what a variable is, but we will explain what a port is.',
     'A free course to learn backend development from scratch: what happens behind every website and app, from the wires of the internet to AI agents. It\'s for anyone: you don\'t need to know backend or how to code to start, because every concept is explained from the beginning, with examples you can try yourself.'),
    ('like a SQL console or cryptography in your browser.', 'like a database or real cryptography, in your browser.'),
  ],
  'fase-0/index.mdx': [
    ('Cada vez que tu frontend hace un `fetch`, pasan muchas cosas antes de que llegue la respuesta.',
     'Cada vez que abres una web, o una app de tu móvil pide datos, pasan muchas cosas antes de que llegue la respuesta.'),
    ('Todavía no vas a escribir código de servidor: vas a entender',
     'No vas a programar nada todavía: vas a entender'),
  ],
  'en/phase-0/index.mdx': [
    ('Every time your frontend runs a `fetch`, a lot happens before the response arrives.',
     'Every time you open a website, or an app on your phone loads data, a lot happens before the response arrives.'),
    ("You won't write server code yet: you'll understand",
     "You won't write any code yet: you'll understand"),
  ],
}
for name, edits in EDITS.items():
    path = D / name
    text = path.read_text()
    for old, _ in edits:
        assert text.count(old) == 1, (name, old[:60])
    for old, new in edits:
        text = text.replace(old, new)
    path.write_text(text)
    print('ok', name)
```

Expected: 4 líneas `ok …`.

- [ ] **Paso 2: comprobar**

Run: `grep -rn "ya programa\|already code\|consola SQL\|SQL console\|tu frontend\|your frontend" web/src/content/docs/index.mdx web/src/content/docs/en/index.mdx web/src/content/docs/fase-0/index.mdx web/src/content/docs/en/phase-0/index.mdx`
Expected: sin salida.

Run: `pnpm build`
Expected: `[seo-audit] 24 páginas auditadas, sin problemas.`. Sin commit.

---

### Tarea 4: Lecciones 1 y 2, para todos los públicos

**Ficheros:**
- Modificar: `web/src/content/docs/fase-0/{modelo-cliente-servidor,que-es-un-protocolo}.mdx` y `web/src/content/docs/en/phase-0/{client-server-model,what-is-a-protocol}.mdx`
- Datos: `docs/plans/2026-10-03-contenido-fase-0/ediciones/{modelo-cliente-servidor,que-es-un-protocolo}.json` (en español, en `cambios.md`, lecciones 1 y 2)

**Interfaces:**
- Produce: el script `aplicar-ediciones.py`. Las Tareas 5 a 7 lo usan igual. Se guarda en el scratchpad de la sesión, no en el repo.

- [ ] **Paso 1: el script que aplica las ediciones**

Guárdalo en el scratchpad de la sesión como `aplicar-ediciones.py`:

```python
"""Aplica las ediciones de docs/plans/2026-10-03-contenido-fase-0/ediciones/<lección>.json.
Comprueba TODAS las ediciones de un fichero antes de escribir: si una no encuentra su texto, no escribe nada."""
import json, re, sys
from pathlib import Path

DATA = Path('docs/plans/2026-10-03-contenido-fase-0/ediciones')
TABLE = re.compile(r'^\|[|:-]*$')

def minutes(text):
    body = text.split('---', 2)[2]
    prose = re.sub(r'^import .*$', '', body, flags=re.M)
    prose = re.sub(r'```[\s\S]*?```', '', prose)
    prose = re.sub(r'\{`[\s\S]*?`\}', ' ', prose)
    prose = re.sub(r'<[^>]+>', ' ', prose)
    return len([w for w in prose.split() if w and not TABLE.match(w)]) / 200

def apply(path, edits):
    text = path.read_text()
    missing = [e['old'][:70] for e in edits if text.count(e['old']) != 1]
    if missing:
        sys.exit(f'{path}: estas ediciones no encuentran su texto (o lo encuentran repetido), no se escribe nada:\n  ' + '\n  '.join(missing))
    for e in edits:
        text = text.replace(e['old'], e['new'])
    return text

for slug in sys.argv[1:]:
    data = json.loads((DATA / f'{slug}.json').read_text())
    results = {lang: (Path(data[lang]['file']), apply(Path(data[lang]['file']), data[lang]['edits'])) for lang in ['es', 'en']}
    for lang, (path, text) in results.items():
        path.write_text(text)
        print(f'{slug} {lang}: {len(data[lang]["edits"])} ediciones, lectura {minutes(text):.2f} min ({round(minutes(text))} en la web)')
```

- [ ] **Paso 2: comprobar que el script se para si una edición no encuentra su texto**

Run, desde la raíz, con una edición imposible en un JSON temporal del scratchpad:

```sh
python3 - <<'EOF'
import json, subprocess, sys
from pathlib import Path
src = Path('docs/plans/2026-10-03-contenido-fase-0/ediciones/modelo-cliente-servidor.json')
data = json.loads(src.read_text())
data['es']['edits'].append({'old': 'Texto que no existe en la lección', 'new': 'x', 'why': 'prueba'})
tmp = src.with_name('prueba-falla.json'); tmp.write_text(json.dumps(data, ensure_ascii=False))
before = Path(data['es']['file']).read_text()
r = subprocess.run([sys.executable, '<scratchpad>/aplicar-ediciones.py', 'prueba-falla'], capture_output=True, text=True)
tmp.unlink()
print('código', r.returncode, '|', r.stderr.strip().splitlines()[0])
print('fichero intacto:', Path(data['es']['file']).read_text() == before)
EOF
```

(Cambia `<scratchpad>` por la ruta del scratchpad de la sesión.)

Expected: `código 1 | …: estas ediciones no encuentran su texto…` y `fichero intacto: True`.

- [ ] **Paso 3: aplicar**

Run: `python3 <scratchpad>/aplicar-ediciones.py modelo-cliente-servidor que-es-un-protocolo`
Expected: 4 líneas, todas con 15 minutos o menos en la web:
- `modelo-cliente-servidor es: 4 ediciones, lectura 8.98 min (9 en la web)`;
- `modelo-cliente-servidor en: 4 ediciones, lectura 8.96 min (9 en la web)`;
- `que-es-un-protocolo es: 11 ediciones, lectura 12.37 min (12 en la web)`;
- `que-es-un-protocolo en: 11 ediciones, lectura 12.63 min (13 en la web)`.

- [ ] **Paso 4: build y repaso**

Run: `pnpm build`
Expected: `All internal links are valid.` y `[seo-audit] 24 páginas auditadas, sin problemas.`

Run: `grep -n "Ya lo has visto" -A 14 web/src/content/docs/fase-0/modelo-cliente-servidor.mdx | head -20`
Expected: primero los puntos para cualquiera (el navegador y las apps, el router de casa), después la línea `Y si programas:` y los puntos de `fetch`, DevTools y Vite.

Sin commit.

---

### Tarea 5: Lecciones 3 y 4, para todos los públicos

**Ficheros:**
- Modificar: `web/src/content/docs/fase-0/{modelo-tcp-ip,ip-puertos-y-sockets}.mdx` y `web/src/content/docs/en/phase-0/{tcp-ip-model,ip-ports-sockets}.mdx`
- Datos: `docs/plans/2026-10-03-contenido-fase-0/ediciones/{modelo-tcp-ip,ip-puertos-y-sockets}.json` (en `cambios.md`, lecciones 3 y 4)

**Interfaces:**
- Consume: `aplicar-ediciones.py` (Tarea 4).

- [ ] **Paso 1: aplicar**

Run: `python3 <scratchpad>/aplicar-ediciones.py modelo-tcp-ip ip-puertos-y-sockets`
Expected:
- **lección 3:** `modelo-tcp-ip es: 8 ediciones, lectura 13.18 min (13 en la web)` y `en: 8 ediciones, lectura 13.14 min (13 en la web)`;
- **lección 4:** `ip-puertos-y-sockets es: 8 ediciones, lectura 15.11 min (15 en la web)` y `en: 8 ediciones, lectura 15.37 min (15 en la web)`.

La lección 4 estaba en el límite: sus ediciones compensan lo que añaden.

- [ ] **Paso 2: build y repaso**

Run: `pnpm build`
Expected: `All internal links are valid.` y `[seo-audit] 24 páginas auditadas, sin problemas.`

Run: `grep -n "question=" web/src/content/docs/fase-0/ip-puertos-y-sockets.mdx | tail -1`
Expected: la última autoevaluación pregunta por `nc -l 8080`, ya no por Vite.

Sin commit.

---

### Tarea 6: Lecciones 5 y 6, para todos los públicos

**Ficheros:**
- Modificar: `web/src/content/docs/fase-0/{tcp-vs-udp,que-es-dns}.mdx` y `web/src/content/docs/en/phase-0/{tcp-vs-udp,what-is-dns}.mdx`
- Datos: `docs/plans/2026-10-03-contenido-fase-0/ediciones/{tcp-vs-udp,que-es-dns}.json` (en `cambios.md`, lecciones 5 y 6)

**Interfaces:**
- Consume: `aplicar-ediciones.py` (Tarea 4).

- [ ] **Paso 1: aplicar**

Run: `python3 <scratchpad>/aplicar-ediciones.py tcp-vs-udp que-es-dns`
Expected:
- **lección 5:** `tcp-vs-udp es: 8 ediciones, lectura 12.35 min (12 en la web)` y `en: 8 ediciones, lectura 12.29 min (12 en la web)`;
- **lección 6:** `que-es-dns es: 4 ediciones, lectura 11.87 min (12 en la web)` y `en: 4 ediciones, lectura 11.68 min (12 en la web)`.

- [ ] **Paso 2: build y repaso**

Run: `pnpm build`
Expected: `All internal links are valid.` y `[seo-audit] 24 páginas auditadas, sin problemas.`

Run: `grep -c "Y si programas, en DevTools:" web/src/content/docs/fase-0/tcp-vs-udp.mdx web/src/content/docs/fase-0/que-es-dns.mdx`
Expected: `1` en cada fichero.

Sin commit.

---

### Tarea 7: Lecciones 7 y 8, para todos los públicos

**Ficheros:**
- Modificar: `web/src/content/docs/fase-0/{tls-y-https,que-pasa-cuando-escribes-una-url}.mdx` y `web/src/content/docs/en/phase-0/{tls-and-https,what-happens-when-you-type-a-url}.mdx`
- Datos: `docs/plans/2026-10-03-contenido-fase-0/ediciones/{tls-y-https,que-pasa-cuando-escribes-una-url}.json` (en `cambios.md`, lecciones 7 y 8)

**Interfaces:**
- Consume: `aplicar-ediciones.py` (Tarea 4).

- [ ] **Paso 1: aplicar**

Run: `python3 <scratchpad>/aplicar-ediciones.py tls-y-https que-pasa-cuando-escribes-una-url`
Expected:
- **lección 7:** `tls-y-https es: 5 ediciones, lectura 13.18 min (13 en la web)` y `en: 5 ediciones, lectura 13.05 min (13 en la web)`;
- **lección 8:** `que-pasa-cuando-escribes-una-url es: 6 ediciones, lectura 11.48 min (11 en la web)` y `en: 6 ediciones, lectura 11.44 min (11 en la web)`.

- [ ] **Paso 2: build, repaso y barrido final**

Run: `pnpm build`
Expected: `All internal links are valid.` y `[seo-audit] 24 páginas auditadas, sin problemas.`

Run, desde la raíz:

```sh
grep -rn "tu frontend\|your frontend\|Tu API\|Your API\|tu código\|your code" web/src/content/docs/fase-0 web/src/content/docs/en/phase-0 | grep -v "Y si programas\|And if you code" | cut -c1-160
```

Expected: solo líneas dentro de los bloques «Y si programas:» / «And if you code:», que la exclusión del `grep` no ve porque van en la línea siguiente. Revisa cada una a mano: tiene que estar debajo de esa línea, o en un paréntesis «(si programas: …)».

Sin commit.

---

### Tarea 8: Documentación

**Ficheros:**
- Modificar: `docs/style-guide.md`, `docs/pendientes.md` y `docs/specs/2026-10-03-seo-design.md`

- [ ] **Paso 1: guía de estilo**

En `docs/style-guide.md`:

1. **«Frontmatter de una lección»:** el ejemplo pasa a ser este (título como pregunta o búsqueda, etiqueta corta y descripción con límites):

```yaml
---
translationKey: client-server   # la misma en las dos versiones de la lección
title: "Modelo cliente-servidor: qué es y cómo funciona"   # lo que busca la gente; entre comillas si lleva «:»
description: "De 70 a 155 caracteres, con las palabras de la búsqueda."
sidebar:
  label: "Modelo cliente-servidor"   # el nombre corto: el del explorador y la paginación
  order: 1            # posición dentro de la fase; la introducción es 0
lesson:
  oneLiner: Responde la pregunta del título en una o dos frases. Es lo primero que se lee bajo el título, y lo que Google suele mostrar.
  objectives:
    - Primer objetivo, empezando por un verbo.
    - Segundo objetivo.
  prerequisites: []   # translationKey de las lecciones previas, p. ej. [client-server]
---
```

2. **En la sección 6 de «Estructura de una lección» (`## Ya lo has visto`)**, añade al final: «Lo que ve cualquiera va primero; los puntos para quien programa, al final, después de una línea suelta "Y si programas:" ("And if you code:").»

3. **En «Rutas, traducciones y SEO»**, añade:

```markdown
- **Títulos para buscadores:** el `title` es la pregunta o la búsqueda que hace la gente («Qué es el DNS y cómo funciona»), y `sidebar.label` el nombre corto («DNS»). El `<title>` completo, con el nombre de la web, no pasa de 70 caracteres, y la descripción tiene entre 70 y 155. Lo comprueba la auditoría.
```

- [ ] **Paso 2: pendientes y spec**

**`docs/pendientes.md`:**
- en «Revisión de contenido», la entrada «**Títulos y descripciones** … y revisión **«para todos los públicos»**» pasa a `[x]`, con «Hecho el 2026-10-03 (plan `docs/plans/2026-10-03-contenido-fase-0.md`). Revisa los cambios en `docs/plans/2026-10-03-contenido-fase-0/cambios.md`: los propusieron agentes y no los has leído con tu voz.»;
- añade a «Revisión de contenido»:
  - `[ ]` **Nombres de DevTools en español:** las lecciones usan *Network* y *Timing*. En Chrome en español son *Red* y otro nombre; conviene comprobarlos y añadirlos.
  - `[ ]` **Textos de Chrome citados de memoria:** «La conexión no es privada» (lección 7). Comprobar que coinciden con los de tu navegador.
  - `[ ]` **Fuera de la Fase 0:** el glosario (`web/src/content/glossary/`) no se ha revisado con el criterio «para todos los públicos».

**`docs/specs/2026-10-03-seo-design.md`:** en la cabecera, `Estado` añade «; §4 y §2.3 (Fase 0) aplicados el 2026-10-03 (`docs/plans/2026-10-03-contenido-fase-0.md`)».

- [ ] **Paso 3: verificación final**

Run: `pnpm format:check && pnpm check && pnpm test && pnpm build`
Expected:
- **formato:** sin cambios pendientes;
- **tipos:** 0 errores;
- **tests:** todos en verde;
- **build:** `All internal links are valid.` y `[seo-audit] 24 páginas auditadas, sin problemas.`

Sin commit.

---

## Fuera de este plan

- **Las lecciones de fases futuras:** se escriben ya con estas reglas.
- **El glosario:** queda en pendientes.
- **La fase de programación antes de la Fase 3:** es una decisión aparte, ya en pendientes.
