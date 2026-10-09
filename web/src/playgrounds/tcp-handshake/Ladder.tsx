import { useEffect, useRef } from 'react';
import { loseLabel, rowDescription, segmentDetail, segmentTitle } from './labels';
import type { LabState } from './machine';
import { fill } from '../../lib/fill';
import type { Strings } from './strings';

interface Props {
  state: LabState;
  t: Strings;
  onLose: (id: number) => void;
}

/** La escalera: una fila por segmento o temporizador, entre la línea del cliente (izquierda) y la del servidor (derecha). */
export default function Ladder({ state, t, onLose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cada fila nueva se lleva a la vista; sin animación si el lector prefiere movimiento reducido.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ top: element.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [state.rows.length]);

  return (
    <div
      ref={scrollRef}
      className="tcp-lab__ladder"
      tabIndex={0}
      role="region"
      aria-label={t.ladderLabel}
    >
      <ol className="tcp-lab__rows" role="list">
        {state.rows.map((row, index) => {
          const position = index + 1;
          if (row.kind === 'timeout') {
            return (
              <li
                key={row.id}
                className={`tcp-lab__row tcp-lab__row--timeout tcp-lab__row--${row.side}`}
              >
                <span className="sr-only">{rowDescription(row, position, t)}</span>
                <span aria-hidden="true">
                  <span className="tcp-lab__index">{position}</span> ⏱{' '}
                  {fill(t.timeoutRow, { side: t.sideName[row.side] })}
                </span>
              </li>
            );
          }
          const { segment, fate } = row;
          const detail = segmentDetail(segment);
          return (
            <li
              key={row.id}
              className={`tcp-lab__row tcp-lab__row--${segment.from} tcp-lab__row--${fate}`}
            >
              <span className="sr-only">{rowDescription(row, position, t)}</span>
              <div className="tcp-lab__arrow" aria-hidden="true">
                <span className="tcp-lab__label">
                  <span className="tcp-lab__index">{position}</span> {segmentTitle(segment, t)}
                  {segment.retransmission && (
                    <span className="tcp-lab__tag"> ({t.retransmission})</span>
                  )}
                </span>
                <span className="tcp-lab__line" />
                {detail && <span className="tcp-lab__detail">{detail}</span>}
                {fate !== 'delivered' && <span className="tcp-lab__fate">{t.fate[fate]}</span>}
              </div>
              {row.changes.map((change) => (
                <span
                  key={`${change.side}-${change.to}`}
                  className={`tcp-lab__change tcp-lab__change--${change.side}`}
                  aria-hidden="true"
                >
                  → {change.to}
                </span>
              ))}
              {fate === 'in-transit' && (
                <button
                  type="button"
                  className="tcp-lab__lose"
                  aria-label={loseLabel(segment, position, state.mode, t)}
                  onClick={() => onLose(segment.id)}
                >
                  {t.lose}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
