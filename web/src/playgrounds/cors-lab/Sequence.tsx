import type { Actor, Step } from './cors';
import { rowDescription, rowText } from './narration';
import type { Strings } from './strings';

interface Props {
  steps: Step[];
  t: Strings;
}

const actors: Actor[] = ['page', 'browser', 'server'];

/** Where a row sits: between two actors' lines, or on one actor's line. */
function span(step: Step): string {
  if ('at' in step) return step.at;
  const [first, last] = [step.from, step.to].sort((a, b) => actors.indexOf(a) - actors.indexOf(b));
  return `${first}-${last}`;
}

/**
 * The sequence: three lines (the page, the browser and the server) and one row per step. Each row
 * reads in full for screen readers; what is drawn is hidden from them.
 */
export default function Sequence({ steps, t }: Props) {
  return (
    <div className="cors-lab__sequence" role="group" aria-label={t.sequenceLabel}>
      <div className="cors-lab__actors" aria-hidden="true">
        {actors.map((actor) => (
          <span key={actor}>{t.actors[actor]}</span>
        ))}
      </div>
      <ol className="cors-lab__rows" role="list">
        {steps.map((step, index) => {
          const { label, details, notSent } = rowText(t, step);
          const direction =
            'at' in step
              ? 'note'
              : actors.indexOf(step.from) < actors.indexOf(step.to)
                ? 'right'
                : 'left';
          const from = 'at' in step ? step.at : step.from;
          const classes = [
            'cors-lab__row',
            `cors-lab__row--${direction}`,
            `cors-lab__row--from-${from}`,
            `cors-lab__row--${step.key}`,
            notSent ? 'cors-lab__row--not-sent' : '',
          ];
          return (
            <li key={`${index}-${step.key}`} className={classes.filter(Boolean).join(' ')}>
              <span className="sr-only">{rowDescription(t, step, index + 1)}</span>
              <div className={`cors-lab__cell cors-lab__cell--${span(step)}`} aria-hidden="true">
                <span className="cors-lab__who">
                  {'at' in step
                    ? t.actors[step.at]
                    : `${t.actors[step.from]} → ${t.actors[step.to]}`}
                </span>
                <span className="cors-lab__label">
                  <span className="cors-lab__index">{index + 1}</span> {label}
                </span>
                {direction !== 'note' && <span className="cors-lab__line" />}
                {notSent && <span className="cors-lab__not-sent">{t.notSent}</span>}
                {details.length > 0 && (
                  <span className="cors-lab__details">
                    {details.map((line) => (
                      <code key={line}>{line}</code>
                    ))}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
