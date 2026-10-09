import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import type { Locale } from '../../lib/locales';
import { fill } from '../../lib/fill';
import { liveText } from '../../lib/live-text';
import { stepText, summary } from './describe';
import { explain, parseDomain, RECORD_TYPES, type RecordType } from './dns';
import { LookupError, lookup, RESOLVER, type LookupFailure, type ResolvedLookup } from './resolver';
import { strings } from './strings';
import './dns-lookup.css';

interface Props {
  /** Language of the lesson where it is used. */
  lang: Locale;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'invalid'; reason: 'empty' | 'invalid' | 'ip' }
  | { kind: 'failed'; reason: LookupFailure }
  | { kind: 'done'; result: ResolvedLookup };

/** Lab: a real DNS lookup and the path resolver → root → TLD → authoritative, step by step. */
export default function DnsLookup({ lang }: Props) {
  const t = strings[lang];
  const ids = useId();
  const [domain, setDomain] = useState('example.com');
  const [type, setType] = useState<RecordType>('A');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [shown, setShown] = useState(0);
  // If the reader looks up twice in a row, only the last answer counts, and the requests of
  // the previous one are cancelled (with long names there are dozens).
  const latest = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  // Who is being asked: 1.1.1.1 and, if it does not answer, 8.8.8.8.
  const [asking, setAsking] = useState(RESOLVER.address);
  // Each attempt changes the announced text a little: that way two identical errors in a row are both announced.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    inFlight.current?.abort();
    setAttempt((count) => count + 1);
    const parsed = parseDomain(domain);
    if (!parsed.ok) {
      // Also invalidates any lookup that may be running: its answer must not cover this error.
      latest.current++;
      setStatus({ kind: 'invalid', reason: parsed.reason });
      return;
    }
    const request = ++latest.current;
    const controller = new AbortController();
    inFlight.current = controller;
    setAsking(RESOLVER.address);
    setStatus({ kind: 'loading' });
    try {
      const result = await lookup(parsed.name, type, {
        signal: controller.signal,
        onResolver: (resolver) => {
          if (request === latest.current) setAsking(resolver.address);
        },
      });
      if (request !== latest.current) return;
      setStatus({ kind: 'done', result });
      setShown(1);
    } catch (error) {
      if (request !== latest.current) return;
      setStatus({
        kind: 'failed',
        reason: error instanceof LookupError ? error.reason : 'resolver',
      });
    }
  }

  const steps = status.kind === 'done' ? explain(status.result) : [];
  const allShown = steps.length > 0 && shown >= steps.length;
  const resolverAddress = status.kind === 'done' ? status.result.resolver : asking;
  const texts = steps.slice(0, shown).map((step) => stepText(step, t, resolverAddress));
  const newest = texts[texts.length - 1];

  // What the aria-live region announces: the lookup status and, when advancing, the new step.
  let message: string;
  switch (status.kind) {
    case 'idle':
      message = t.idle;
      break;
    case 'loading':
      message = fill(t.loading, { resolver: asking });
      break;
    case 'invalid':
    case 'failed':
      message = t.errors[status.reason];
      break;
    case 'done':
      message = summary(status.result, t);
  }
  // When advancing, the new step is already visible in the list: it is only announced for screen readers.
  const stepAnnouncement =
    status.kind === 'done' && shown > 1 && newest
      ? `${newest.from} → ${newest.to}: ${t.quoteOpen}${newest.says}${t.quoteClose}`
      : '';

  const isError = status.kind === 'invalid' || status.kind === 'failed';

  return (
    <section className="dns-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <p className="dns-lab__title">
        <span aria-hidden="true">{'// '}</span>
        {t.title}
      </p>

      <form className="dns-lab__form" onSubmit={submit} noValidate>
        <div className="dns-lab__field dns-lab__field--domain">
          <label htmlFor={`${ids}-domain`}>{t.domainLabel}</label>
          <input
            id={`${ids}-domain`}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            aria-invalid={status.kind === 'invalid'}
            aria-describedby={status.kind === 'invalid' ? `${ids}-status` : undefined}
          />
        </div>
        <div className="dns-lab__field">
          <label htmlFor={`${ids}-type`}>{t.typeLabel}</label>
          <select
            id={`${ids}-type`}
            value={type}
            onChange={(event) => setType(event.target.value as RecordType)}
          >
            {RECORD_TYPES.map((recordType) => (
              <option key={recordType} value={recordType}>
                {recordType}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="dns-lab__submit">
          {t.submit}
        </button>
      </form>

      <p
        id={`${ids}-status`}
        className={isError ? 'dns-lab__status dns-lab__status--error' : 'dns-lab__status'}
        aria-live="polite"
      >
        {liveText(message, attempt)}
      </p>
      <p className="sr-only" aria-live="polite">
        {stepAnnouncement}
      </p>

      {texts.length > 0 && (
        <ol className="dns-lab__steps" aria-label={t.stepsLabel}>
          {texts.map((text, index) => (
            <li key={index} className="dns-lab__step">
              <p className="dns-lab__route">
                <span className="dns-lab__index">{index + 1}</span> {text.from} → {text.to}
              </p>
              <p className="dns-lab__says">
                {t.quoteOpen}
                {text.says}
                {t.quoteClose}
              </p>
            </li>
          ))}
        </ol>
      )}

      {status.kind === 'done' && (
        <div className="dns-lab__controls">
          <button
            type="button"
            className="dns-lab__next"
            aria-disabled={allShown}
            onClick={() => setShown((count) => Math.min(count + 1, steps.length))}
          >
            <span aria-hidden="true">▶ </span>
            {t.next}
          </button>
          <button type="button" aria-disabled={allShown} onClick={() => setShown(steps.length)}>
            {t.showAll}
          </button>
        </div>
      )}

      {status.kind === 'done' && allShown && status.result.records.length > 0 && (
        <table className="dns-lab__records" role="table">
          <caption>{t.recordsTitle}</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                {t.columns.name}
              </th>
              <th scope="col" role="columnheader">
                {t.columns.type}
              </th>
              <th scope="col" role="columnheader">
                {t.columns.ttl}
              </th>
              <th scope="col" role="columnheader">
                {t.columns.data}
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {status.result.records.map((record, index) => (
              <tr key={index} role="row">
                <td role="cell" data-label={t.columns.name}>
                  {record.name}
                </td>
                <td role="cell" data-label={t.columns.type}>
                  {record.type}
                </td>
                <td role="cell" data-label={t.columns.ttl}>
                  {record.ttl}
                </td>
                <td role="cell" data-label={t.columns.data}>
                  {record.data}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="dns-lab__honesty">{t.honesty}</p>
    </section>
  );
}
