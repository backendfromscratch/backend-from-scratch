/**
 * Sequence diagrams written in Mermaid syntax, converted to HTML at build time. Only what the course
 * uses is supported: named participants, messages (->>), replies (-->>) and notes. Anything else
 * fails with a clear message: the build does not publish a diagram it cannot draw.
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
    throw new DiagramError(`Expected «sequenceDiagram» but got «${first?.text}».`, first?.number);
  }
  const participants: Participant[] = [];
  const steps: SequenceStep[] = [];
  const declared = (id: string, number: number) => {
    if (!participants.some((p) => p.id === id)) {
      throw new DiagramError(
        `Participant «${id}» is not declared: add «participant ${id} as Name».`,
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
        throw new DiagramError(`Participant «${id}» is declared twice.`, number);
      }
      participants.push({ id: id!, label: label!.trim() });
      if (participants.length > MAX_PARTICIPANTS) {
        throw new DiagramError(
          `At most ${MAX_PARTICIPANTS} participants fit; this diagram has ${participants.length}.`,
          number,
        );
      }
    } else if (message) {
      const [, from, arrow, to, body] = message;
      if (from === to)
        throw new DiagramError(
          `A message from a participant to itself is not supported («${from}»).`,
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
        `Unsupported line: «${line}». Supported: participant X as Name, X->>Y: text, X-->>Y: text and Note over X[,Y]: text.`,
        number,
      );
    }
  }

  if (participants.length < 2) throw new Error('At least 2 participants are needed.');
  if (steps.length === 0) throw new Error('The diagram has no steps.');
  return { participants, steps };
}

/**
 * A figure with a grid of one column per participant (classes seq-c<column> and seq-s<width>, no
 * inline styles). Each step says in text who talks to whom: screen readers announce it and, on
 * narrow screens, it is what is shown (src/styles/diagrams.css).
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
