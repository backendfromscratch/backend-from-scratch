import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { fill } from '../../lib/fill';
import { liveText } from '../../lib/live-text';
import type { Locale } from '../../lib/locales';
import { createSession, fetchText, StoppedError, type Session } from './client';
import type { Reply } from './database';
import { errorText, MAX_ROWS, type Output } from './results';
import { strings, type Strings } from './strings';
import './sql-playground.css';

/** The shop's data in each language: the same file the reader loads with psql (spec §5). */
const DATA: Record<Locale, string> = { es: '/practicas/tienda.sql', en: '/practicas/shop.sql' };

interface Props {
  /** Language of the lesson where it is used. */
  lang: Locale;
  /** The lesson's query, already written in the box. */
  query?: string;
  /** Height of the box, in lines. */
  rows?: number;
}

function countText(output: Extract<Output, { kind: 'rows' }>, t: Strings): string {
  if (output.total > output.rows.length)
    return fill(t.rowsCapped, { count: output.total, shown: MAX_ROWS });
  return output.total === 1 ? t.oneRow : fill(t.rows, { count: output.total });
}

function doneText(affected: number, t: Strings): string {
  if (affected === 0) return t.doneNone;
  return affected === 1 ? t.doneOne : fill(t.done, { count: affected });
}

/** Playground: SQL against a real PostgreSQL (PGlite) in a worker, with the shop's data. */
export default function SqlPlayground({ lang, query, rows = 4 }: Props) {
  const t = strings[lang];
  const ids = useId();
  const session = useRef<Session | null>(null);
  // Whether the engine is up now, and whether it ever was (then its files are already downloaded).
  const started = useRef(false);
  const downloaded = useRef(false);
  const [sql, setSql] = useState(query ?? t.defaultQuery);
  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncementText] = useState('');
  const [attempt, setAttempt] = useState(0);
  const announce = (text: string) => {
    setAnnouncementText(text);
    setAttempt((count) => count + 1);
  };

  const getSession = () => (session.current ??= createSession(fetchText(DATA[lang])));

  // Leaving the page ends the worker, and the memory PostgreSQL holds.
  useEffect(() => () => session.current?.stop(), []);

  async function run() {
    if (running) {
      announce(t.wait);
      return;
    }
    setRunning(true);
    setReply(null);
    setNotice(started.current ? t.running : downloaded.current ? t.restarting : t.loading);
    try {
      const result = await getSession().run(sql);
      started.current = true;
      downloaded.current = true;
      setReply(result);
      setNotice(null);
      if (result.error) announce(fill(t.announceError, { message: result.error.message }));
      else if (result.meta) announce(fill(t.meta, { command: result.meta }));
      else if (result.outputs.length === 0) announce(t.nothing);
      else {
        const last = result.outputs.at(-1)!;
        announce(
          last.kind === 'rows'
            ? fill(t.announceRows, { count: last.total })
            : doneText(last.affected, t),
        );
      }
    } catch (error) {
      if (error instanceof StoppedError) return;
      setNotice(t.failed);
      announce(t.failed);
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    if (!running) return;
    session.current?.stop();
    started.current = false;
    setReply(null);
    setNotice(t.stopped);
    announce(t.stopped);
  }

  function reset() {
    getSession().stop();
    started.current = false;
    setReply(null);
    setNotice(t.restored);
    announce(t.restored);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void run();
    }
  };

  return (
    <section className="sql-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <p className="sql-lab__title">{t.title}</p>
      <p className="sql-lab__intro">{t.intro}</p>
      {/* Outside the busy area: a screen reader could silence what is announced inside it. */}
      <p className="sr-only" aria-live="polite">
        {liveText(announcement, attempt)}
      </p>
      <label className="sql-lab__field" htmlFor={`${ids}-sql`}>
        {t.queryLabel}
      </label>
      <textarea
        id={`${ids}-sql`}
        className="sql-lab__query"
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="sql-lab__actions">
        <button type="button" className="sql-lab__run" onClick={() => void run()}>
          {t.run}
        </button>
        {/* Always there, so focus is never lost: disabled while nothing runs. */}
        <button type="button" aria-disabled={running ? undefined : true} onClick={stop}>
          {t.stop}
        </button>
        <button type="button" onClick={reset}>
          {t.reset}
        </button>
        <span className="sql-lab__shortcut">{t.shortcut}</span>
      </div>
      <div className="sql-lab__output" aria-busy={running ? true : undefined}>
        {notice && <p className="sql-lab__notice">{notice}</p>}
        {reply?.outputs.map((output, index) =>
          output.kind === 'rows' ? (
            <div key={index} className="sql-lab__result">
              <div
                className="sql-lab__table"
                tabIndex={0}
                role="region"
                aria-label={fill(t.table, { number: index + 1 })}
              >
                <table>
                  <thead>
                    <tr>
                      {output.columns.map((column, c) => (
                        <th key={c} scope="col">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {output.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((value, c) => (
                          <td key={c}>
                            {value === null ? <span className="sql-lab__null">NULL</span> : value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="sql-lab__count">{countText(output, t)}</p>
            </div>
          ) : (
            <p key={index} className="sql-lab__count">
              {doneText(output.affected, t)}
            </p>
          ),
        )}
        {reply?.error && <pre className="sql-lab__error">{errorText(reply.error)}</pre>}
        {reply?.meta && <p className="sql-lab__notice">{fill(t.meta, { command: reply.meta })}</p>}
        {reply && !reply.error && !reply.meta && reply.outputs.length === 0 && (
          <p className="sql-lab__notice">{t.nothing}</p>
        )}
      </div>
    </section>
  );
}
