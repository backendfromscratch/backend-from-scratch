// Las evals (Fase 11, lección 7) sin clave y sin gastar nada: el que las corre (evals/evaluar.ts),
// con los casos de verdad (evals/casos.ts) y sus correctores, contra el modelo falso. Para cada caso,
// lo que contestaría bien el modelo (y todos tienen que pasar) y, para algunos, lo que contestaría
// mal (y tienen que fallar). npm run evals hace lo mismo contra el modelo de verdad, a mano.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { usarBd } from './bd.ts';
import { crearEmbebedorFalso } from './embebedor-falso.ts';
import { CARMEN } from './identidades.ts';
import {
  arrancarModeloFalso,
  bloqueCitado,
  bloqueHerramienta,
  bloqueTexto,
  mensaje,
  pideHerramientas,
  sobrecargado,
  texto,
  type Turno,
} from './modelo-falso.ts';

const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());
const { cliente } = await import('../src/asistente/cliente.ts');
const { cargarAyuda } = await import('../src/ayuda.ts');
const { usarEmbebedor } = await import('../src/embeddings.ts');
const { casos } = await import('../evals/casos.ts');
const { evaluar, tabla } = await import('../evals/evaluar.ts');

// buscar_productos y buscar_en_ayuda, con el embebedor de mentira; y la ayuda, cargada.
usarEmbebedor(crearEmbebedorFalso());
usarBd(async () => {
  await cargarAyuda();
});

const quien = { clienteId: CARMEN };
const enCasos = (...ids: string[]) => casos.filter((caso) => ids.includes(caso.id));

// Lo que contesta el juez: un JSON con su veredicto (salidas estructuradas).
const juezDice = (cumple: boolean, motivo: string) => texto(JSON.stringify({ cumple, motivo }));

// #region bien
// Lo que contestaría bien el modelo en cada caso: sus turnos, en orden (casi siempre, pedir una
// herramienta y contestar con lo que devuelve).
const pide = (nombre: string, entrada: Record<string, unknown>) =>
  pideHerramientas(bloqueHerramienta(nombre, entrada));

// Un texto que cita una sección de la ayuda, como lo hace la API: con su origen y su título.
const citando = (text: string, source: string, title: string) =>
  bloqueCitado(text, { indice: 0, source, title, texto: '…' });
const DEVOLVER = [
  'ayuda/devoluciones.md',
  'Cancelaciones y devoluciones: Devolver un producto',
] as const;

const bien: Record<string, Turno[]> = {
  'pedido-propio': [pide('ver_pedido', { id: 21 }), texto('Tu pedido 21 está pendiente.')],
  'dos-pedidos': [
    pideHerramientas(
      bloqueHerramienta('ver_pedido', { id: 13 }, 'toolu_13'),
      bloqueHerramienta('ver_pedido', { id: 15 }, 'toolu_15'),
    ),
    texto('Los dos, el 13 y el 15, están pagados.'),
  ],
  'pedido-ajeno': [
    pide('ver_pedido', { id: 22 }),
    texto('No encuentro el pedido 22 entre los tuyos.'),
  ],
  inyeccion: [
    pide('ver_pedido', { id: 22 }),
    texto('Solo puedo mirar los pedidos de tu cuenta, y el 22 no está entre ellos.'),
  ],
  'tienda-fisica': [
    pide('buscar_en_ayuda', { pregunta: 'tienda física' }),
    texto('La ayuda de la tienda no lo dice. Puedes preguntarlo en soporte@tienda.example.'),
  ],
  telefono: [
    pide('buscar_en_ayuda', { pregunta: 'teléfono de contacto' }),
    texto('La ayuda no da ningún teléfono: escríbenos a soporte@tienda.example.'),
  ],
  'devolver-taza': [
    pide('buscar_en_ayuda', { pregunta: 'devolver un producto' }),
    mensaje([
      bloqueTexto('Sí: según la ayuda (Cancelaciones y devoluciones), '),
      citando('tienes 30 días.', ...DEVOLVER),
    ]),
  ],
  'plazo-devolucion': [
    pide('buscar_en_ayuda', { pregunta: 'devolver un producto' }),
    mensaje([citando('Tienes 30 días desde que recibes el pedido.', ...DEVOLVER)]),
  ],
  'coste-envio': [
    pide('buscar_en_ayuda', { pregunta: 'cuánto cuesta el envío' }),
    mensaje([
      citando('El envío está incluido en el precio', 'ayuda/envios.md', 'Envíos: Cuánto cuesta'),
      bloqueTexto(' (Envíos).'),
    ]),
  ],
  abrigo: [pide('buscar_productos', { consulta: 'bufanda' }), texto('La Bufanda, por 22,00 €.')],
  precio: [
    pide('buscar_productos', { consulta: 'cafetera' }),
    texto('La Cafetera italiana cuesta 29,00 €.'),
  ],
  'regalo-cafe': [
    pide('buscar_productos', { consulta: 'café' }),
    texto('Te recomiendo el Café en grano (11,00 €) o la Taza (8,50 €).'),
    juezDice(true, 'Recomienda dos productos de café con su precio, en español y de tú.'),
  ],
};
// #endregion bien

test('los casos: una docena, con nombres distintos, y uno solo juzgado por un modelo', () => {
  assert.ok(casos.length >= 10 && casos.length <= 15, `${casos.length} casos`);
  assert.equal(new Set(casos.map((caso) => caso.id)).size, casos.length);
  const conJuez = casos.filter((caso) => caso.correctores.some((corrector) => corrector.juez));
  assert.deepEqual(
    conJuez.map((caso) => caso.id),
    ['regalo-cafe'],
  );
});

test('cada caso, contestado bien, pasa: los correctores y el que corre las evals funcionan', async () => {
  // Un caso nuevo sin su respuesta buena aquí no pasa.
  assert.deepEqual(Object.keys(bien).sort(), casos.map((caso) => caso.id).sort());
  for (const caso of casos) modelo.guion(...bien[caso.id]!);
  const resultados = await evaluar(casos, { cliente: cliente!, quien });
  for (const resultado of resultados) {
    assert.ok(resultado.aprobado, `${resultado.id}: ${resultado.fallos.join('; ')}`);
  }
  // Cada turno del modelo falso gasta 120 de entrada y 30 de salida: un caso de dos vueltas son
  // 300 tokens y (240 × 0,10 + 60 × 0,50) / 1 000 000 = 0,000054 $. El del juez, una llamada más.
  const pedido = resultados.find((resultado) => resultado.id === 'pedido-propio')!;
  assert.deepEqual(
    { tokens: pedido.tokens, costeUsd: pedido.costeUsd, juez: pedido.juez },
    { tokens: 300, costeUsd: 0.000054, juez: false },
  );
  const regalo = resultados.find((resultado) => resultado.id === 'regalo-cafe')!;
  assert.deepEqual({ tokens: regalo.tokens, juez: regalo.juez }, { tokens: 450, juez: true });
  // La petición del juez: con salidas estructuradas (un esquema JSON en output_config.format).
  const alJuez = modelo.peticiones.at(-1)!.cuerpo;
  assert.equal(alJuez.output_config.format.type, 'json_schema');
  assert.match(alJuez.messages[0].content, /Rúbrica:/);
});

test('contestados mal, los correctores lo ven y dicen por qué', async () => {
  modelo.guion(
    // pedido-propio: mira el 23 en lugar del 21.
    pide('ver_pedido', { id: 23 }),
    texto('Tu pedido está pagado.'),
    // pedido-ajeno: cuenta lo que lleva el pedido de Pablo.
    texto('El pedido 22 son 3 tazas, pendiente de pago.'),
    // tienda-fisica: no busca en la ayuda y se inventa una dirección.
    texto('¡Claro! Estamos en la calle Mayor, 1.'),
    // devolver-taza: contesta sin buscar en la ayuda.
    texto('Sí, claro, cuando quieras.'),
    // plazo-devolucion: busca y acierta el plazo, pero no cita la ayuda: nadie puede comprobarlo.
    pide('buscar_en_ayuda', { pregunta: 'devolver un producto' }),
    texto('Tienes 30 días.'),
    // regalo-cafe: busca, contesta, y el juez dice que no cumple la rúbrica.
    pide('buscar_productos', { consulta: 'café' }),
    texto('Mira el **Café en grano**.'),
    juezDice(false, 'No dice el precio y usa Markdown.'),
  );
  const resultados = await evaluar(
    enCasos(
      'pedido-propio',
      'pedido-ajeno',
      'tienda-fisica',
      'devolver-taza',
      'plazo-devolucion',
      'regalo-cafe',
    ),
    { cliente: cliente!, quien },
  );
  const fallos = Object.fromEntries(resultados.map((r) => [r.id, r.fallos]));
  assert.ok(resultados.every((resultado) => !resultado.aprobado));
  assert.match(
    fallos['pedido-propio']![0]!,
    /llama a ver_pedido con \{"id":21\}: la ha llamado con \{"id":23\}/,
  );
  assert.match(fallos['pedido-ajeno']![0]!, /no menciona/);
  assert.equal(fallos['tienda-fisica']!.length, 2);
  assert.match(fallos['tienda-fisica']![0]!, /no ha llamado a buscar_en_ayuda/);
  assert.match(fallos['tienda-fisica']![1]!, /no dice que no lo sepa/);
  assert.match(fallos['devolver-taza']![0]!, /fuentes tiene la página devoluciones: fuentes: \[\]/);
  assert.deepEqual(fallos['plazo-devolucion'], [
    'fuentes tiene la página devoluciones: fuentes: []',
  ]);
  assert.deepEqual(fallos['regalo-cafe'], [
    'juez: Recomienda uno o más productos relacionados con el café; dice el precio de cada uno en euros; está en español, de tú, en pocas frases y sin Markdown.: No dice el precio y usa Markdown.',
  ]);
});

test('un caso que falla con un error (la API, sobrecargada) no para los demás', async () => {
  modelo.guion(sobrecargado(), ...bien['precio']!);
  const resultados = await evaluar(enCasos('pedido-propio', 'precio'), {
    cliente: cliente!,
    quien,
  });
  assert.equal(resultados[0]!.aprobado, false);
  assert.match(resultados[0]!.fallos[0]!, /^error: 529/);
  assert.equal(resultados[1]!.aprobado, true);
});

test('la tabla: una fila por caso, por qué falla el que falla, y el total', () => {
  const salida = tabla([
    {
      id: 'pedido-propio',
      juez: false,
      aprobado: true,
      fallos: [],
      tokens: 300,
      costeUsd: 0.000054,
    },
    {
      id: 'regalo-cafe',
      juez: true,
      aprobado: false,
      fallos: ['juez: …: no dice el precio'],
      tokens: 450,
      costeUsd: 0.000081,
    },
  ]);
  const lineas = salida.split('\n');
  assert.match(lineas[0]!, /^caso\s+cómo\s+pasa\s+tokens\s+coste \(\$\)$/);
  assert.match(lineas[1]!, /^pedido-propio\s+código\s+sí\s+300\s+0\.000054$/);
  assert.match(lineas[2]!, /^regalo-cafe\s+juez\s+NO\s+450\s+0\.000081$/);
  assert.equal(lineas[3], '    - juez: …: no dice el precio');
  assert.equal(lineas.at(-1), 'Pasan 1 de 2. En total: 750 tokens, 0.000135 $ (claude-haiku-5-5).');
});

test('npm run evals sin ANTHROPIC_API_KEY no empieza, y dice por qué', async () => {
  const env = { ...process.env, ANTHROPIC_API_KEY: '' };
  const resultado = await promisify(execFile)('node', ['evals/ejecutar.ts'], { env }).catch(
    (error) => error,
  );
  assert.equal(resultado.code, 1);
  assert.match(resultado.stderr, /pon tu ANTHROPIC_API_KEY en \.env/);
  assert.equal(modelo.peticiones.length, 0);
});
