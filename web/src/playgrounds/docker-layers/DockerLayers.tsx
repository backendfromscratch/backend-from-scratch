import { useId, useReducer, type ReactNode } from 'react';
import { fill } from '../../lib/fill';
import { liveText } from '../../lib/live-text';
import type { Locale } from '../../lib/locales';
import { displayText, stagesOf, type Instruction, type Stage } from './dockerfile';
import { changes, initialState, reduce, variantOf, type Order } from './lab-state';
import { totals } from './measure';
import { describeFiles, formatBytes, formatSeconds, narrate } from './narration';
import { capture } from './fixtures';
import { base, scenarios } from './scenarios';
import { strings } from './strings';
import './docker-layers.css';

interface Props {
  /** Language of the lesson where it is used. */
  lang: Locale;
}

const orders: Order[] = ['good', 'wrong'];

/**
 * Lab: the shop's Dockerfile next to the layers it builds, which ones the cache reuses after a
 * change, why the order of the instructions matters and what multi-stage leaves out of the image.
 * Spec: docs/specs/2026-10-14-phase-7-design.md (§4).
 */
export default function DockerLayers({ lang }: Props) {
  const t = strings[lang];
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const id = useId();
  const variant = variantOf(state);
  const { instructions, steps } = scenarios[variant];
  const stages = stagesOf(instructions);
  const multi = stages.length > 1;
  const sums = totals(instructions, steps, base.bytes, state.build);
  const buildLabel = state.build ? t.rebuild : t.build;
  const bytes = (value: number) => formatBytes(t, lang, value);
  const seconds = (value: number) => formatSeconds(t, lang, value);
  const line = (index: number) => fill(t.line, { n: index + 1 });
  const baseImage = displayText(base.image);

  /** The note under a line of the Dockerfile: what a COPY takes, or that it adds no layer. */
  const lineNote = (instruction: Instruction): string | null => {
    if (instruction.kind === 'FROM') return null;
    if (!instruction.layer) return t.metadata;
    if (instruction.files.length === 0) return null;
    const files = describeFiles(t, lang, instruction.files);
    return instruction.from === undefined
      ? fill(t.copies, { files })
      : fill(t.copiesFrom, { stage: instruction.from, files });
  };

  const stageTitle = (stage: Stage) => fill(t.stage, { name: stage.name });

  /** The first item of a stage's stack: the base image, or the stage it starts from. */
  const stackStart = (stage: Stage, position: number): ReactNode => {
    if (stage.fromStage) {
      return (
        <li className="docker-lab__layer docker-lab__layer--from">
          {fill(t.stageFrom, { stage: stage.base })}
        </li>
      );
    }
    const again = stages.slice(0, position).some((s) => !s.fromStage && s.base === stage.base);
    return (
      <li className="docker-lab__layer docker-lab__layer--base">
        <span className="docker-lab__layer-main">
          <code>
            {fill(t.base, { image: baseImage, layers: base.layers, size: bytes(base.bytes) })}
          </code>
        </span>
        <span className="docker-lab__note">{again ? t.baseAgain : t.baseNote}</span>
      </li>
    );
  };

  const layer = (instruction: Instruction): ReactNode => {
    const status = state.build?.[instruction.index] ?? 'none';
    const measure = steps[instruction.index]!;
    const ran = status === 'rebuilt' && instruction.sameAs === undefined;
    return (
      <li
        key={instruction.index}
        className={`docker-lab__layer docker-lab__layer--${status}`}
        data-line={instruction.index + 1}
      >
        <span className="docker-lab__layer-main">
          <span className="docker-lab__line-ref">{line(instruction.index)}</span>{' '}
          <code>{displayText(instruction.text)}</code>
        </span>
        <span className="docker-lab__layer-facts">
          <span className="docker-lab__size">{bytes(measure.bytes ?? 0)}</span>
          <span
            // Remounts when a build ends, so the mark appears with a short fade.
            key={state.attempt}
            className="docker-lab__mark"
          >
            <span aria-hidden="true">
              {status === 'cached' ? '✓ ' : status === 'rebuilt' ? '↻ ' : '· '}
            </span>
            {t.status[status]}
            {ran && ` · ${seconds(measure.seconds ?? 0)}`}
          </span>
        </span>
        {instruction.sameAs !== undefined && (
          <span className="docker-lab__note">
            {fill(t.sharedStep, { n: instruction.sameAs + 1 })}
          </span>
        )}
      </li>
    );
  };

  return (
    <section className="docker-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <header className="docker-lab__header">
        <p className="docker-lab__title">
          <span aria-hidden="true">{'// '}</span>
          {t.title}
        </p>
        <div className="docker-lab__switches">
          <fieldset
            className="docker-lab__switch"
            disabled={state.multiStage}
            aria-describedby={state.multiStage ? `${id}-order` : undefined}
          >
            <legend>{t.orderLegend}</legend>
            {orders.map((order) => (
              <label key={order} className="docker-lab__option">
                <input
                  type="radio"
                  name={`${id}-order-choice`}
                  value={order}
                  checked={state.order === order}
                  onChange={() => dispatch({ type: 'order', order })}
                />
                {t.order[order]}
              </label>
            ))}
          </fieldset>
          <fieldset className="docker-lab__switch">
            <legend>{t.multiStageLegend}</legend>
            {([false, true] as const).map((on) => (
              <label key={String(on)} className="docker-lab__option">
                <input
                  type="radio"
                  name={`${id}-multi-stage`}
                  value={on ? 'on' : 'off'}
                  checked={state.multiStage === on}
                  onChange={() => dispatch({ type: 'multi-stage', on })}
                />
                {on ? t.multiStage.on : t.multiStage.off}
              </label>
            ))}
          </fieldset>
        </div>
        {state.multiStage && (
          <p id={`${id}-order`} className="docker-lab__hint">
            {t.orderFixed}
          </p>
        )}
      </header>

      <div className="docker-lab__columns">
        <div className="docker-lab__column">
          <p className="docker-lab__heading" id={`${id}-file`}>
            {t.dockerfile}
          </p>
          <p className="docker-lab__subheading">{t.dockerfileNote}</p>
          <ol className="docker-lab__file" aria-labelledby={`${id}-file`}>
            {instructions.map((instruction) => {
              const note = lineNote(instruction);
              const startsStage = instruction.kind === 'FROM' && instruction.index > 0;
              return (
                <li
                  key={instruction.index}
                  className={`docker-lab__code-line${startsStage ? ' docker-lab__code-line--stage' : ''}${instruction.layer ? '' : ' docker-lab__code-line--meta'}`}
                >
                  <code>{displayText(instruction.text)}</code>
                  {note && <span className="docker-lab__note">{note}</span>}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="docker-lab__column">
          <p className="docker-lab__heading" id={`${id}-layers`}>
            {t.layers}
          </p>
          <p className="docker-lab__subheading">{t.layersNote}</p>
          {stages.map((stage, position) => {
            const titleId = `${id}-stage-${position}`;
            return (
              <div
                key={stage.name || 'single'}
                className={`docker-lab__stage${multi ? ` docker-lab__stage--${stage.final ? 'final' : 'build'}` : ''}`}
              >
                {multi && (
                  <p className="docker-lab__stage-title" id={titleId}>
                    <strong>{stageTitle(stage)}</strong>
                    {' · '}
                    {stage.final ? t.stageFinal : t.stageBuild}
                  </p>
                )}
                <ol
                  className="docker-lab__stack"
                  aria-labelledby={multi ? titleId : `${id}-layers`}
                >
                  {stackStart(stage, position)}
                  {stage.instructions
                    .map((index) => instructions[index]!)
                    .filter((instruction) => instruction.layer)
                    .map(layer)}
                </ol>
              </div>
            );
          })}
        </div>
      </div>

      <dl className="docker-lab__totals">
        <div>
          <dt>{t.imageSize}</dt>
          <dd>
            <strong>{bytes(sums.imageBytes)}</strong>{' '}
            <span className="docker-lab__detail">
              ({fill(t.imageSizeDetail, { base: bytes(sums.baseBytes), own: bytes(sums.ownBytes) })}
              )
            </span>
          </dd>
        </div>
        {multi && (
          <div>
            <dt>{t.leftOut}</dt>
            <dd>
              <strong>{bytes(sums.leftOutBytes)}</strong>
            </dd>
          </div>
        )}
        <div>
          <dt>{t.buildTime}</dt>
          <dd>
            {state.build ? (
              <>
                <strong>{seconds(sums.seconds)}</strong>{' '}
                <span className="docker-lab__detail">
                  ({fill(t.buildTimeDetail, { rebuilt: sums.rebuilt, cached: sums.cached })})
                </span>
                {multi && <span className="docker-lab__note">{t.parallelNote}</span>}
              </>
            ) : (
              t.notBuilt
            )}
          </dd>
        </div>
        <div>
          <dt>{t.pending}</dt>
          <dd>{state.pending.length === 0 ? t.none : describeFiles(t, lang, state.pending)}</dd>
        </div>
      </dl>

      <div className="docker-lab__narration" aria-live="polite">
        <p>
          {liveText(narrate(t, lang, state.narration, instructions, buildLabel), state.attempt)}
        </p>
      </div>

      <div className="docker-lab__controls" role="group" aria-label={t.actions}>
        {changes.map((change) => (
          <button
            key={change}
            type="button"
            className="docker-lab__change"
            onClick={() => dispatch({ type: 'change', change })}
          >
            {t.change[change]}
          </button>
        ))}
        <button
          type="button"
          className="docker-lab__build"
          onClick={() => dispatch({ type: 'build' })}
        >
          <span aria-hidden="true">▶ </span>
          {buildLabel}
        </button>
      </div>

      <p className="docker-lab__source">{fill(t.source, { date: capture.date })}</p>
    </section>
  );
}
