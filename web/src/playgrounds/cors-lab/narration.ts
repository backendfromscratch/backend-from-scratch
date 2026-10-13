/** Turns the lab's steps into words: the narration, the diagram's labels and each row's description. */
import { fill } from '../../lib/fill';
import type { FailureDetail, Header, Step } from './cors';
import type { Strings } from './strings';

/** «A», «A y B», «A, B y C». */
export function listOf(t: Strings, items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${t.and}${items.at(-1)}`;
}

/** Why the browser said no, in a sentence. */
function failureSentence(t: Strings, failure: FailureDetail): string {
  return fill(t.failures[failure.failure], {
    value: failure.value ?? '',
    page: t.names.page,
    method: failure.method,
    header: failure.header ?? '',
  });
}

const headerValue = (headers: Header[], name: string) =>
  headers.find(([header]) => header === name)?.[1];

/** The sentence that explains a step. */
export function narrate(t: Strings, step: Step): string {
  const n = t.narration;
  switch (step.key) {
    case 'page-calls-fetch':
      return (
        fill(n.pageCallsFetch, { method: step.method, url: step.url }) +
        (step.credentials === 'include' ? n.withCookies : '')
      );
    case 'same-origin':
      return fill(n.sameOrigin, { page: t.names.page });
    case 'simple-request':
      return fill(n.simpleRequest, { method: step.method });
    case 'needs-preflight': {
      const reasons = step.reasons.map((reason) =>
        fill(n.reasons[reason], { method: step.method }),
      );
      return fill(n.needsPreflight, { reasons: listOf(t, reasons) });
    }
    case 'preflight-sent':
      return fill(n.preflightSent, { path: step.path });
    case 'preflight-answered':
      return n.preflightAnswered[step.status];
    case 'preflight-fails':
      return fill(n.preflightFails, {
        reason: failureSentence(t, step.failure),
        method: step.method,
      });
    case 'request-sent': {
      const values = { method: step.method, path: step.path, page: t.names.page };
      if (step.sameOrigin) return fill(n.requestSentSameOrigin, values);
      return (
        fill(n.requestSent, values) +
        (step.cookie ? n.requestSentWithCookie : n.requestSentWithoutCookie)
      );
    }
    case 'server-acts':
      return n.serverActs[step.method] + (step.crossOrigin ? n.beforeAnyCheck : '');
    case 'response-answered': {
      const value = headerValue(step.headers, 'Access-Control-Allow-Origin');
      return (
        n.responseAnswered +
        (value ? fill(n.responseWithOrigin, { value }) : n.responseWithoutOrigin)
      );
    }
    case 'check-passes':
      return fill(n.checkPasses, {
        value: step.allowOrigin,
        why: step.allowOrigin === '*' ? n.passesAny : n.passesPage,
        cookies: step.credentials === 'include' ? n.passesCredentials : '',
      });
    case 'check-fails':
      return fill(n.checkFails, {
        reason: failureSentence(t, step.failure),
        method: step.failure.method,
      });
    case 'page-reads':
      return fill(n.pageReads, { body: t.responseBody });
    case 'page-gets-error':
      return n.pageGetsError;
  }
}

/** What a row of the diagram shows: a short label and, below it, the headers that travel. */
export interface RowText {
  label: string;
  details: string[];
  /** The real request after a failed preflight: drawn, but it never travels. */
  notSent?: boolean;
}

const headerLines = (headers: Header[]) => headers.map(([name, value]) => `${name}: ${value}`);

export function rowText(t: Strings, step: Step): RowText {
  switch (step.key) {
    case 'page-calls-fetch':
      return {
        label: 'fetch(…)',
        details: [`${step.method} ${step.url}`, `credentials: '${step.credentials}'`],
      };
    case 'same-origin':
      return { label: t.notes.sameOrigin, details: [] };
    case 'simple-request':
      return { label: t.notes.simple, details: [] };
    case 'needs-preflight':
      return { label: t.notes.preflight, details: [] };
    case 'preflight-sent':
      return { label: `OPTIONS ${step.path}`, details: headerLines(step.headers) };
    case 'preflight-answered':
    case 'response-answered':
      return { label: t.statusText[step.status], details: headerLines(step.headers) };
    case 'preflight-fails':
      return { label: `${step.method} ${step.path}`, details: [], notSent: true };
    case 'request-sent':
      return { label: `${step.method} ${step.path}`, details: headerLines(step.headers) };
    case 'server-acts':
      return { label: t.notes.serverActs[step.method], details: [] };
    case 'check-passes':
      return { label: t.notes.passes, details: [] };
    case 'check-fails':
      return { label: t.notes.fails, details: [] };
    case 'page-reads':
      return { label: t.responseBody, details: [] };
    case 'page-gets-error':
      return { label: 'TypeError: Failed to fetch', details: [] };
  }
}

/** The full sentence a screen reader reads for row {n}: who, to whom, what and with which headers. */
export function rowDescription(t: Strings, step: Step, n: number): string {
  const { label, details, notSent } = rowText(t, step);
  if ('at' in step) return fill(t.noteRow, { n, actor: t.actors[step.at], note: label });
  const values = {
    n,
    from: t.actors[step.from],
    to: t.actors[step.to],
    label: notSent ? `${label}, ${t.notSent}` : label,
  };
  if (details.length === 0) return fill(t.arrowRow, values);
  const headers = details.map((line) => line.replace(': ', t.colon));
  return fill(t.arrowRowHeaders, { ...values, headers: listOf(t, headers) });
}
