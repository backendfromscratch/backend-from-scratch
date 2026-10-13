import { useId, useReducer } from 'react';
import { fill } from '../../lib/fill';
import type { Locale } from '../../lib/locales';
import { chromeMessage, fetchError } from './chrome-messages';
import {
  allowableHeaders,
  bodyOf,
  bodyTypes,
  credentialsModes,
  methods,
  run,
  scenarioIds,
  type AllowOrigin,
  type BodyType,
  type Credentials,
  type Destination,
  type Method,
  type ScenarioId,
} from './cors';
import { initialState, reduce } from './lab-state';
import { narrate } from './narration';
import Sequence from './Sequence';
import { strings } from './strings';
import './cors-lab.css';

interface Props {
  /** Language of the lesson where it is used. */
  lang: Locale;
}

const allowOrigins: AllowOrigin[] = ['absent', '*', 'page', 'other'];
const destinations: Destination[] = ['api', 'same'];

/** Adds or removes `item` from a list, keeping the list's own order. */
function toggle<T>(list: readonly T[], all: readonly T[], item: T, on: boolean): T[] {
  return all.filter((x) => (x === item ? on : list.includes(x)));
}

/**
 * Lab: what the browser does with a fetch to another origin, step by step, and why the page
 * can or cannot read the answer. Spec: docs/specs/2026-10-12-cors-lab-design.md
 */
export default function CorsLab({ lang }: Props) {
  const t = strings[lang];
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState());
  const id = useId();
  const { request, server } = state.settings;
  const result = run(state.settings, t.names);
  const steps = result.steps.slice(0, state.shown);
  const done = state.shown >= result.steps.length;
  const { outcome } = result;
  const noBody = bodyOf({ ...request, body: 'application/json' }) === 'none';

  const answer = (value: boolean) => (
    <>
      <span aria-hidden="true">{value ? '✓ ' : '✕ '}</span>
      {value ? t.yes : t.no}
    </>
  );

  return (
    <section className="cors-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <header className="cors-lab__header">
        <p className="cors-lab__title">
          <span aria-hidden="true">{'// '}</span>
          {t.title}
        </p>
        <label className="cors-lab__field cors-lab__scenario">
          <span>{t.scenario}</span>
          <select
            value={state.scenario}
            onChange={(event) =>
              dispatch({ type: 'scenario', id: event.target.value as ScenarioId })
            }
          >
            {scenarioIds.map((scenario) => (
              <option key={scenario} value={scenario}>
                {t.scenarios[scenario]}
              </option>
            ))}
            {state.scenario === 'custom' && <option value="custom">{t.custom}</option>}
          </select>
        </label>
      </header>

      <div className="cors-lab__settings">
        <details className="cors-lab__group">
          <summary>{t.request}</summary>
          <div className="cors-lab__fields">
            <label className="cors-lab__field">
              <span>{t.method}</span>
              <select
                value={request.method}
                onChange={(event) =>
                  dispatch({ type: 'request', patch: { method: event.target.value as Method } })
                }
              >
                {methods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <label className="cors-lab__field">
              <span>{t.body}</span>
              <select
                value={noBody ? 'none' : request.body}
                disabled={noBody}
                aria-describedby={noBody ? `${id}-body` : undefined}
                onChange={(event) =>
                  dispatch({ type: 'request', patch: { body: event.target.value as BodyType } })
                }
              >
                {bodyTypes.map((body) => (
                  <option key={body} value={body}>
                    {body === 'none' ? t.bodyNone : body}
                  </option>
                ))}
              </select>
              {noBody && (
                <small id={`${id}-body`} className="cors-lab__hint">
                  {t.bodyIgnored}
                </small>
              )}
            </label>
            <label className="cors-lab__check">
              <input
                type="checkbox"
                checked={request.authorization}
                onChange={(event) =>
                  dispatch({ type: 'request', patch: { authorization: event.target.checked } })
                }
              />
              {t.authorization}
            </label>
            <label className="cors-lab__field">
              <span>{t.credentials}</span>
              <select
                value={request.credentials}
                onChange={(event) =>
                  dispatch({
                    type: 'request',
                    patch: { credentials: event.target.value as Credentials },
                  })
                }
              >
                {credentialsModes.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </label>
            <label className="cors-lab__field">
              <span>{t.destination}</span>
              <select
                value={request.destination}
                onChange={(event) =>
                  dispatch({
                    type: 'request',
                    patch: { destination: event.target.value as Destination },
                  })
                }
              >
                {destinations.map((destination) => (
                  <option key={destination} value={destination}>
                    {t.destinations[destination]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="cors-lab__group">
          <summary>{t.server}</summary>
          <div className="cors-lab__fields">
            <label className="cors-lab__field">
              <span>{t.answersOptions}</span>
              <select
                value={server.answersOptions ? 'yes' : 'no'}
                onChange={(event) =>
                  dispatch({
                    type: 'server',
                    patch: { answersOptions: event.target.value === 'yes' },
                  })
                }
              >
                <option value="yes">{t.answersOptionsValues.yes}</option>
                <option value="no">{t.answersOptionsValues.no}</option>
              </select>
            </label>
            <label className="cors-lab__field">
              <span>{t.allowOrigin}</span>
              <select
                value={server.allowOrigin}
                onChange={(event) =>
                  dispatch({
                    type: 'server',
                    patch: { allowOrigin: event.target.value as AllowOrigin },
                  })
                }
              >
                {allowOrigins.map((value) => (
                  <option key={value} value={value}>
                    {fill(t.allowOriginValues[value], {
                      page: t.names.page,
                      other: t.names.other,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="cors-lab__checks">
              <legend>{t.allowMethods}</legend>
              {methods.map((method) => (
                <label key={method} className="cors-lab__check">
                  <input
                    type="checkbox"
                    checked={server.allowMethods.includes(method)}
                    onChange={(event) =>
                      dispatch({
                        type: 'server',
                        patch: {
                          allowMethods: toggle(
                            server.allowMethods,
                            methods,
                            method,
                            event.target.checked,
                          ),
                        },
                      })
                    }
                  />
                  {method}
                </label>
              ))}
            </fieldset>
            <fieldset className="cors-lab__checks">
              <legend>{t.allowHeaders}</legend>
              {allowableHeaders.map((header) => (
                <label key={header} className="cors-lab__check">
                  <input
                    type="checkbox"
                    checked={server.allowHeaders.includes(header)}
                    onChange={(event) =>
                      dispatch({
                        type: 'server',
                        patch: {
                          allowHeaders: toggle(
                            server.allowHeaders,
                            allowableHeaders,
                            header,
                            event.target.checked,
                          ),
                        },
                      })
                    }
                  />
                  {header}
                </label>
              ))}
            </fieldset>
            <label className="cors-lab__check">
              <input
                type="checkbox"
                checked={server.allowCredentials}
                onChange={(event) =>
                  dispatch({ type: 'server', patch: { allowCredentials: event.target.checked } })
                }
              />
              {t.allowCredentials}
            </label>
          </div>
        </details>
      </div>

      <Sequence steps={steps} t={t} />

      <div className="cors-lab__narration" aria-live="polite">
        <p>{narrate(t, steps.at(-1)!)}</p>
      </div>

      <div className="cors-lab__controls">
        <button
          type="button"
          className="cors-lab__next"
          aria-disabled={done}
          onClick={() => !done && dispatch({ type: 'step' })}
        >
          <span aria-hidden="true">▶ </span>
          {t.next}
        </button>
        <button
          type="button"
          aria-disabled={done}
          onClick={() => !done && dispatch({ type: 'all' })}
        >
          <span aria-hidden="true">» </span>
          {t.all}
        </button>
        <button type="button" onClick={() => dispatch({ type: 'reset' })}>
          <span aria-hidden="true">↺ </span>
          {t.reset}
        </button>
      </div>

      <div className="cors-lab__outcome">
        <p className="cors-lab__outcome-title">{t.outcome}</p>
        <dl>
          {(['reached', 'cookie', 'readable'] as const).map((question) => (
            <div key={question}>
              <dt>{t.questions[question]}</dt>
              <dd className={done ? `cors-lab__answer--${outcome[question]}` : undefined}>
                {done ? answer(outcome[question]) : t.pending}
              </dd>
            </div>
          ))}
        </dl>
        {done && outcome.failure && (
          <div className="cors-lab__console">
            <p className="cors-lab__console-title">{t.console}</p>
            <p className="cors-lab__console-line">
              {chromeMessage(outcome.failure, result.url, t.names.page)}
            </p>
            <p className="cors-lab__console-line">{fetchError}</p>
          </div>
        )}
      </div>
    </section>
  );
}
