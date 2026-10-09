/**
 * Diagramas de secuencia escritos con la sintaxis de Mermaid, convertidos a HTML en el build. Solo
 * se admite lo que usa el curso: participantes con nombre, mensajes (->>), respuestas (-->>) y notas.
 * Lo demás falla con un mensaje claro: el build no publica un diagrama que no sabe dibujar.
 */
import { DiagramError } from './errors';
import { el, lines, text, type HastElement } from './hast';

export interface Participant {
  id: string;
  label: string;
}
export type SequenceStep =
  | { kind: 'message'; from: string; to: string; reply: boolean; text: string[] }
  | { kind: 'note'; over: string[]; text: string[] };
export interface Sequence {
  participants: Participant[];
  steps: SequenceStep[];
}

const MAX_PARTICIPANTS = 6;
const PARTICIPANT = /^participant\s+(\w+)\s+as\s+(.+)$/;
const MESSAGE = /^(\w+)\s*(-->>|->>)\s*(\w+)\s*:\s*(.+)$/;
const NOTE = /^Note\s+over\s+(\w+(?:\s*,\s*\w+)?)\s*:\s*(.+)$/;
const splitText = (value: string) => value.split(/<br\s*\/?>/i).map((part) => part.trim());

export function parseSequence(source: string): Sequence {
  const [first, ...rest] = source
    .split('\n')
    .map((text, i) => ({ text: text.trim(), number: i + 1 }))
    .filter((line) => line.text);
  if (first?.text !== 'sequenceDiagram') {
    throw new DiagramError(
      `Se esperaba «sequenceDiagram» y llega «${first?.text}».`,
      first?.number,
    );
  }
  const participants: Participant[] = [];
  const steps: SequenceStep[] = [];
  const declared = (id: string, number: number) => {
    if (!participants.some((p) => p.id === id)) {
      throw new DiagramError(
        `El participante «${id}» no está declarado: añade «participant ${id} as Nombre».`,
        number,
      );
    }
    return id;
  };

  for (const { text: line, number } of rest) {
    const participant = PARTICIPANT.exec(line);
    const message = MESSAGE.exec(line);
    const note = NOTE.exec(line);
    if (participant) {
      const [, id, label] = participant;
      if (participants.some((p) => p.id === id)) {
        throw new DiagramError(`El participante «${id}» está repetido.`, number);
      }
      participants.push({ id: id!, label: label!.trim() });
      if (participants.length > MAX_PARTICIPANTS) {
        throw new DiagramError(
          `Caben como mucho ${MAX_PARTICIPANTS} participantes; este diagrama tiene ${participants.length}.`,
          number,
        );
      }
    } else if (message) {
      const [, from, arrow, to, body] = message;
      if (from === to)
        throw new DiagramError(
          `No se admite un mensaje de un participante a sí mismo («${from}»).`,
          number,
        );
      steps.push({
        kind: 'message',
        from: declared(from!, number),
        to: declared(to!, number),
        reply: arrow === '-->>',
        text: splitText(body!),
      });
    } else if (note) {
      const [, over, body] = note;
      steps.push({
        kind: 'note',
        over: over!.split(',').map((id) => declared(id.trim(), number)),
        text: splitText(body!),
      });
    } else {
      throw new DiagramError(
        `Línea no admitida: «${line}». Admitido: participant X as Nombre, X->>Y: texto, X-->>Y: texto y Note over X[,Y]: texto.`,
        number,
      );
    }
  }

  if (participants.length < 2) throw new Error('Hacen falta al menos 2 participantes.');
  if (steps.length === 0) throw new Error('El diagrama no tiene ningún paso.');
  return { participants, steps };
}

/**
 * Una figura con una cuadrícula de una columna por participante (clases seq-c<columna> y
 * seq-s<anchura>, sin estilos en línea). Cada paso dice en texto quién habla a quién: lo oyen los
 * lectores de pantalla y, en pantallas estrechas, es lo que se ve (src/styles/diagrams.css).
 */
export function renderSequence(seq: Sequence): HastElement {
  const column = new Map(seq.participants.map((p, i) => [p.id, i + 1]));
  const label = new Map(seq.participants.map((p) => [p.id, p.label]));
  const span = (a: number, b: number) => [`seq-c${Math.min(a, b)}`, `seq-s${Math.abs(a - b) + 1}`];

  const steps = seq.steps.map((step) => {
    if (step.kind === 'note') {
      const columns = step.over.map((id) => column.get(id)!);
      return el(
        'li',
        {
          className: [
            'seq__step',
            'seq__step--note',
            ...span(Math.min(...columns), Math.max(...columns)),
          ],
        },
        [
          el('span', { className: ['seq__route'] }, [
            text(step.over.map((id) => label.get(id)!).join(' · ')),
          ]),
          el('span', { className: ['seq__text'] }, lines(step.text)),
        ],
      );
    }
    const from = column.get(step.from)!;
    const to = column.get(step.to)!;
    return el(
      'li',
      {
        className: [
          'seq__step',
          step.reply ? 'seq__step--reply' : 'seq__step--message',
          to > from ? 'seq__step--right' : 'seq__step--left',
          ...span(from, to),
        ],
      },
      [
        el('span', { className: ['seq__route'] }, [
          text(`${label.get(step.from)} → ${label.get(step.to)}`),
        ]),
        el('span', { className: ['seq__text'] }, lines(step.text)),
      ],
    );
  });

  return el('figure', { className: ['seq', `seq--n${seq.participants.length}`, 'not-content'] }, [
    el(
      'ol',
      { className: ['seq__participants'], ariaHidden: 'true' },
      seq.participants.map((p, i) =>
        el('li', { className: ['seq__participant', `seq-c${i + 1}`] }, [text(p.label)]),
      ),
    ),
    el('ol', { className: ['seq__steps'] }, steps),
  ]);
}
