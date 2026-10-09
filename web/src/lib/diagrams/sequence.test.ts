import { describe, expect, it } from 'vitest';
import { classList, findByClass, textContent } from './hast';
import { parseSequence, renderSequence } from './sequence';
import type { DiagramError } from './errors';

const CLIENT_SERVER = `sequenceDiagram
    participant C as Navegador (cliente)
    participant S as nc -l 8080 (servidor)
    Note over S: Ya estaba escuchando en el puerto 8080
    C->>S: Petición: GET / HTTP/1.1
    S-->>C: Respuesta: HTTP/1.1 200 OK<br/>«Hola desde mi servidor»`;

describe('parseSequence', () => {
  it('lee participantes, mensajes, respuestas y notas; el texto puede llevar «:»', () => {
    expect(parseSequence(CLIENT_SERVER)).toEqual({
      participants: [
        { id: 'C', label: 'Navegador (cliente)' },
        { id: 'S', label: 'nc -l 8080 (servidor)' },
      ],
      steps: [
        { kind: 'note', over: ['S'], text: ['Ya estaba escuchando en el puerto 8080'] },
        { kind: 'message', from: 'C', to: 'S', reply: false, text: ['Petición: GET / HTTP/1.1'] },
        {
          kind: 'message',
          from: 'S',
          to: 'C',
          reply: true,
          text: ['Respuesta: HTTP/1.1 200 OK', '«Hola desde mi servidor»'],
        },
      ],
    });
  });

  it('una nota puede ir sobre dos participantes', () => {
    const seq = parseSequence(
      'sequenceDiagram\nparticipant N as Navegador\nparticipant S as Servidor\nNote over N,S: Todo va cifrado.',
    );
    expect(seq.steps).toEqual([{ kind: 'note', over: ['N', 'S'], text: ['Todo va cifrado.'] }]);
  });

  it.each([
    [
      'sequenceDiagram\nparticipant A as A\nparticipant B as B\nloop Cada segundo\nA->>B: hola\nend',
      /Línea no admitida: «loop Cada segundo»/,
    ],
    [
      'sequenceDiagram\nparticipant A as A\nparticipant C as C\nA->>B: hola',
      /«B» no está declarado/,
    ],
    ['sequenceDiagram\nparticipant A as A\nparticipant B as B\nA->>A: hola', /a sí mismo/],
    ['sequenceDiagram\nparticipant A as A\nparticipant A as Otra', /«A» está repetido/],
    [
      `sequenceDiagram\n${'abcdefg'
        .split('')
        .map((id) => `participant ${id} as ${id}`)
        .join('\n')}\na->>b: hola`,
      /como mucho 6 participantes/,
    ],
    ['sequenceDiagram\nparticipant A as A\nNote over A: sola', /al menos 2 participantes/],
    ['sequenceDiagram\nparticipant A as A\nparticipant B as B', /no tiene ningún paso/],
  ])('falla con un mensaje claro ante lo que no admite (%#)', (source, error) => {
    expect(() => parseSequence(source)).toThrow(error);
  });
});

describe('renderSequence', () => {
  const figure = renderSequence(parseSequence(CLIENT_SERVER));

  it('es una figura sin estilos de prosa, con una columna por participante', () => {
    expect(figure.tagName).toBe('figure');
    expect(classList(figure)).toEqual(['seq', 'seq--n2', 'not-content']);
  });

  it('los participantes van en la cabecera, ocultos al lector de pantalla (cada paso dice quién habla)', () => {
    expect(findByClass(figure, 'seq__participants')[0]?.properties.ariaHidden).toBe('true');
    expect(findByClass(figure, 'seq__participant').map(textContent)).toEqual([
      'Navegador (cliente)',
      'nc -l 8080 (servidor)',
    ]);
  });

  it('cada paso ocupa las columnas entre sus participantes y dice quién habla a quién', () => {
    const steps = findByClass(figure, 'seq__step');
    expect(steps.map(classList)).toEqual([
      ['seq__step', 'seq__step--note', 'seq-c2', 'seq-s1'],
      ['seq__step', 'seq__step--message', 'seq__step--right', 'seq-c1', 'seq-s2'],
      ['seq__step', 'seq__step--reply', 'seq__step--left', 'seq-c1', 'seq-s2'],
    ]);
    expect(steps.map((step) => textContent(findByClass(step, 'seq__route')[0]!))).toEqual([
      'nc -l 8080 (servidor)',
      'Navegador (cliente) → nc -l 8080 (servidor)',
      'nc -l 8080 (servidor) → Navegador (cliente)',
    ]);
  });

  it('los saltos de línea del texto son <br>', () => {
    expect(textContent(findByClass(figure, 'seq__text')[2]!)).toBe(
      'Respuesta: HTTP/1.1 200 OK\n«Hola desde mi servidor»',
    );
  });
});

describe('parseSequence: la línea del error', () => {
  const errorOf = (source: string) => {
    try {
      parseSequence(source);
    } catch (error) {
      return error as DiagramError;
    }
    throw new Error('no ha lanzado');
  };

  it('un error de una línea dice cuál, contando desde la primera del bloque y con las vacías', () => {
    expect(errorOf('sequenceDiagram\n  participant A as A\n\n  loop x').line).toBe(4);
  });

  it('un error de todo el diagrama no tiene línea', () => {
    expect(errorOf('sequenceDiagram\nparticipant A as A').line).toBeUndefined();
  });
});
