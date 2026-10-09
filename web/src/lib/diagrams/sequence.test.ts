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
  it('reads participants, messages, replies and notes; the text may contain «:»', () => {
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

  it('a note can span two participants', () => {
    const seq = parseSequence(
      'sequenceDiagram\nparticipant N as Navegador\nparticipant S as Servidor\nNote over N,S: Todo va cifrado.',
    );
    expect(seq.steps).toEqual([{ kind: 'note', over: ['N', 'S'], text: ['Todo va cifrado.'] }]);
  });

  it.each([
    [
      'sequenceDiagram\nparticipant A as A\nparticipant B as B\nloop Cada segundo\nA->>B: hola\nend',
      /Unsupported line: «loop Cada segundo»/,
    ],
    ['sequenceDiagram\nparticipant A as A\nparticipant C as C\nA->>B: hola', /«B» is not declared/],
    ['sequenceDiagram\nparticipant A as A\nparticipant B as B\nA->>A: hola', /to itself/],
    ['sequenceDiagram\nparticipant A as A\nparticipant A as Otra', /«A» is declared twice/],
    [
      `sequenceDiagram\n${'abcdefg'
        .split('')
        .map((id) => `participant ${id} as ${id}`)
        .join('\n')}\na->>b: hola`,
      /At most 6 participants/,
    ],
    ['sequenceDiagram\nparticipant A as A\nNote over A: sola', /At least 2 participants/],
    ['sequenceDiagram\nparticipant A as A\nparticipant B as B', /has no steps/],
  ])('fails with a clear message on unsupported input (%#)', (source, error) => {
    expect(() => parseSequence(source)).toThrow(error);
  });
});

describe('renderSequence', () => {
  const figure = renderSequence(parseSequence(CLIENT_SERVER));

  it('is a figure without prose styles, with one column per participant', () => {
    expect(figure.tagName).toBe('figure');
    expect(classList(figure)).toEqual(['seq', 'seq--n2', 'not-content']);
  });

  it('participants go in the header, hidden from screen readers (each step says who is talking)', () => {
    expect(findByClass(figure, 'seq__participants')[0]?.properties.ariaHidden).toBe('true');
    expect(findByClass(figure, 'seq__participant').map(textContent)).toEqual([
      'Navegador (cliente)',
      'nc -l 8080 (servidor)',
    ]);
  });

  it('each step spans the columns between its participants and says who talks to whom', () => {
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

  it('line breaks in the text are <br>', () => {
    expect(textContent(findByClass(figure, 'seq__text')[2]!)).toBe(
      'Respuesta: HTTP/1.1 200 OK\n«Hola desde mi servidor»',
    );
  });
});

describe('parseSequence: the error line', () => {
  const errorOf = (source: string) => {
    try {
      parseSequence(source);
    } catch (error) {
      return error as DiagramError;
    }
    throw new Error('did not throw');
  };

  it('a single-line error says which line, counting from the first of the block and including empty ones', () => {
    expect(errorOf('sequenceDiagram\n  participant A as A\n\n  loop x').line).toBe(4);
  });

  it('an error about the whole diagram has no line', () => {
    expect(errorOf('sequenceDiagram\nparticipant A as A').line).toBeUndefined();
  });
});
