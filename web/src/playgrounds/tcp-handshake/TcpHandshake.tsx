import { useEffect, useId, useReducer, useRef } from 'react';
import type { Locale } from '../../lib/locales';
import Ladder from './Ladder';
import { DEFAULT_ISN, canStep, initialState, reduce, type LabConfig, type Mode } from './machine';
import { doneMessage, narrate, quote } from './narration';
import { strings } from './strings';
import './tcp-handshake.css';

interface Props {
  /** Language of the lesson where it is used. */
  lang: Locale;
}

const modes: Mode[] = ['tcp', 'udp'];

/** Lab: the TCP handshake, its ACKs and retransmissions, and the contrast with UDP. Spec: docs/specs/2026-10-03-tcp-lab-design.md */
export default function TcpHandshake({ lang }: Props) {
  const t = strings[lang];
  const config: LabConfig = {
    payloads: t.payloads,
    clientIsn: DEFAULT_ISN.client,
    serverIsn: DEFAULT_ISN.server,
  };
  const [state, dispatch] = useReducer(reduce, config, (c) => initialState('tcp', c));
  const radioName = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const focusAfterLose = useRef(false);

  // «Perder» disappears when pressed: focus moves to «Siguiente paso», or to «Reiniciar» if it has finished.
  useEffect(() => {
    if (!focusAfterLose.current) return;
    focusAfterLose.current = false;
    (canStep(state) ? nextRef : resetRef).current?.focus();
  }, [state]);

  const lose = (id: number) => {
    focusAfterLose.current = true;
    dispatch({ type: 'lose', id });
  };
  const stateLabel = (side: 'client' | 'server') =>
    state.mode === 'udp' ? t.udpNoState : state[side].state;
  const done = doneMessage(t, state);

  return (
    <section className="tcp-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <header className="tcp-lab__header">
        <p className="tcp-lab__title">
          <span aria-hidden="true">{'// '}</span>
          {t.title}
        </p>
        <fieldset className="tcp-lab__modes">
          <legend>{t.protocol}</legend>
          {modes.map((mode) => (
            <label key={mode} className="tcp-lab__mode">
              <input
                type="radio"
                name={radioName}
                value={mode}
                checked={state.mode === mode}
                onChange={() => dispatch({ type: 'reset', mode })}
              />
              {mode.toUpperCase()}
            </label>
          ))}
        </fieldset>
      </header>

      <div className="tcp-lab__lanes">
        <p>
          <span className="tcp-lab__side">{t.client}</span> <code>{stateLabel('client')}</code>
        </p>
        <p>
          <span className="tcp-lab__side">{t.server}</span> <code>{stateLabel('server')}</code>
        </p>
      </div>

      <Ladder state={state} t={t} onLose={lose} />

      <div className="tcp-lab__app">
        <p className="tcp-lab__app-title">{t.appTitle}</p>
        <dl>
          <div>
            <dt>{t.received}</dt>
            <dd>{state.server.delivered === '' ? t.nothing : quote(t, state.server.delivered)}</dd>
          </div>
          {state.mode === 'tcp' && (
            <div>
              <dt>{t.buffered}</dt>
              <dd>
                {state.server.buffered.length === 0
                  ? t.nothing
                  : state.server.buffered.map((piece) => quote(t, piece.payload)).join(' ')}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="tcp-lab__narration" aria-live="polite">
        <p>{narrate(t, state.narration)}</p>
        {done && <p className="tcp-lab__done">{done}</p>}
      </div>

      <div className="tcp-lab__controls">
        <button
          ref={nextRef}
          type="button"
          className="tcp-lab__next"
          aria-disabled={!canStep(state)}
          onClick={() => dispatch({ type: 'step' })}
        >
          <span aria-hidden="true">▶ </span>
          {t.next}
        </button>
        <button
          ref={resetRef}
          type="button"
          className="tcp-lab__reset"
          onClick={() => dispatch({ type: 'reset', mode: state.mode })}
        >
          <span aria-hidden="true">↺ </span>
          {t.reset}
        </button>
      </div>
    </section>
  );
}
