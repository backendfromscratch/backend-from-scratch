import { useEffect, useId, useRef, useState } from 'react';
import { fill } from '../../lib/fill';
import { liveText } from '../../lib/live-text';
import type { Locale } from '../../lib/locales';
import {
  abbreviatePem,
  decrypt,
  encrypt,
  exportPem,
  fromBase64,
  generateEncryptionKeys,
  generateSigningKeys,
  isCryptoAvailable,
  sign,
  verify,
} from './crypto';
import { strings, type Strings } from './strings';
import './crypto-keys.css';

interface Props {
  /** Language of the lesson where it is used. */
  lang: Locale;
}

/** An abbreviated PEM key, expandable in full. */
function KeyBox({
  label,
  pem,
  t,
  note,
}: {
  label: string;
  pem: string;
  t: Strings;
  note?: string;
}) {
  return (
    <div className="crypto-lab__key">
      <p className="crypto-lab__label">{label}</p>
      <pre>{abbreviatePem(pem)}</pre>
      {abbreviatePem(pem) !== pem && (
        <details>
          <summary>{t.showFull}</summary>
          <pre>{pem}</pre>
        </details>
      )}
      {note && <p className="crypto-lab__note">{note}</p>}
    </div>
  );
}

/** Playground: encrypt and decrypt with RSA-OAEP, and sign and verify with ECDSA, with the real Web Crypto API. */
export default function CryptoKeys({ lang }: Props) {
  const t = strings[lang];
  const ids = useId();
  const [available, setAvailable] = useState(true);
  const [announcement, setAnnouncementText] = useState('');
  // Each announcement changes the text slightly: that way two identical notices in a row are both announced.
  const [attempt, setAttempt] = useState(0);
  const setAnnouncement = (text: string) => {
    setAnnouncementText(text);
    setAttempt((count) => count + 1);
  };
  // While an operation is running, other clicks are ignored (without disabling buttons: focus
  // is not lost), but not silently: a notice is announced. Generating RSA keys can take seconds on a phone.
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [encryptionKeys, setEncryptionKeys] = useState<{
    pair: CryptoKeyPair;
    publicPem: string;
    privatePem: string;
  } | null>(null);
  const [message, setMessage] = useState(t.defaultMessage);
  const [ciphertext, setCiphertext] = useState<string | null>(null);
  const [encryptError, setEncryptError] = useState(false);
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [wrongKeyFailed, setWrongKeyFailed] = useState(false);

  const [signingKeys, setSigningKeys] = useState<{ pair: CryptoKeyPair; publicPem: string } | null>(
    null,
  );
  const [toSign, setToSign] = useState(t.defaultToSign);
  const [signature, setSignature] = useState<string | null>(null);
  const [received, setReceived] = useState('');
  const [verdict, setVerdict] = useState<boolean | null>(null);

  useEffect(() => setAvailable(isCryptoAvailable(window)), []);

  /** Runs an operation: one at a time, saying what it does if it takes long, and saying if it fails. */
  async function run(action: () => Promise<void>, pendingText?: string) {
    if (busy.current) {
      setAnnouncement(t.wait);
      return;
    }
    busy.current = true;
    setFailure(null);
    if (pendingText) {
      setPending(pendingText);
      setAnnouncement(pendingText);
    }
    try {
      await action();
    } catch {
      // Expected errors (message too long, another key) are handled by each operation; this is
      // the unexpected, which used to go unseen.
      setFailure(t.failed);
      setAnnouncement(t.failed);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  const resetEncryption = () => {
    setCiphertext(null);
    setEncryptError(false);
    setDecrypted(null);
    setWrongKeyFailed(false);
  };

  const generateForEncryption = () =>
    run(async () => {
      const pair = await generateEncryptionKeys();
      setEncryptionKeys({
        pair,
        publicPem: await exportPem(pair.publicKey),
        privatePem: await exportPem(pair.privateKey),
      });
      resetEncryption();
      setAnnouncement(t.keysReady);
    }, t.generating);

  const encryptMessage = () =>
    run(async () => {
      if (!encryptionKeys) return;
      resetEncryption();
      try {
        const result = await encrypt(encryptionKeys.pair.publicKey, message);
        setCiphertext(result);
        setAnnouncement(fill(t.encrypted, { bytes: fromBase64(result).length }));
      } catch {
        setEncryptError(true);
        setAnnouncement(t.tooLong);
      }
    });

  const decryptMessage = () =>
    run(async () => {
      if (!encryptionKeys || !ciphertext) return;
      const text = await decrypt(encryptionKeys.pair.privateKey, ciphertext);
      setDecrypted(text);
      setAnnouncement(fill(t.decryptedAnnounce, { text }));
    });

  const decryptWithAnotherKey = () =>
    run(async () => {
      if (!ciphertext) return;
      const other = await generateEncryptionKeys();
      try {
        await decrypt(other.privateKey, ciphertext);
      } catch {
        setWrongKeyFailed(true);
        setAnnouncement(t.wrongKeyFailed);
      }
    }, t.generating);

  const generateForSigning = () =>
    run(async () => {
      const pair = await generateSigningKeys();
      setSigningKeys({ pair, publicPem: await exportPem(pair.publicKey) });
      setSignature(null);
      setVerdict(null);
      setAnnouncement(t.keysReady);
    }, t.generating);

  const signMessage = () =>
    run(async () => {
      if (!signingKeys) return;
      const result = await sign(signingKeys.pair.privateKey, toSign);
      setSignature(result);
      setReceived(toSign);
      setVerdict(null);
      setAnnouncement(fill(t.signed, { bytes: fromBase64(result).length }));
    });

  const verifyMessage = () =>
    run(async () => {
      if (!signingKeys || !signature) return;
      const ok = await verify(signingKeys.pair.publicKey, received, signature);
      setVerdict(ok);
      setAnnouncement(ok ? t.valid : t.invalid);
    });

  return (
    <section className="crypto-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <p className="crypto-lab__title">
        <span aria-hidden="true">{'// '}</span>
        {t.title}
      </p>
      {pending && <p className="crypto-lab__status">{pending}</p>}
      {failure && <p className="crypto-lab__status crypto-lab__status--error">{failure}</p>}
      <p className="sr-only" aria-live="polite">
        {liveText(announcement, attempt)}
      </p>

      {!available ? (
        <p className="crypto-lab__unavailable">{t.unavailable}</p>
      ) : (
        // aria-busy only on the parts: the announcing region stays outside, so screen readers
        // do not go quiet on "Generating…".
        <div className="crypto-lab__parts" aria-busy={pending ? true : undefined}>
          <section className="crypto-lab__part" aria-labelledby={`${ids}-encrypt`}>
            <h3 id={`${ids}-encrypt`}>{t.encryptTitle}</h3>
            <p className="crypto-lab__intro">{t.encryptIntro}</p>
            <button type="button" onClick={generateForEncryption}>
              {t.generate}
            </button>
            {encryptionKeys && (
              <div className="crypto-lab__keys">
                <KeyBox label={t.publicKey} pem={encryptionKeys.publicPem} t={t} />
                <KeyBox
                  label={t.privateKey}
                  pem={encryptionKeys.privatePem}
                  t={t}
                  note={t.privateWarning}
                />
              </div>
            )}
            <label className="crypto-lab__field">
              <span>{t.message}</span>
              <textarea
                rows={2}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  resetEncryption();
                }}
              />
            </label>
            <div className="crypto-lab__actions">
              <button
                type="button"
                className="crypto-lab__primary"
                disabled={!encryptionKeys}
                onClick={encryptMessage}
              >
                {t.encrypt}
              </button>
              <button type="button" disabled={!ciphertext} onClick={decryptMessage}>
                {t.decrypt}
              </button>
              <button type="button" disabled={!ciphertext} onClick={decryptWithAnotherKey}>
                {t.wrongKey}
              </button>
            </div>
            {encryptError && <p className="crypto-lab__bad">{t.tooLong}</p>}
            {ciphertext && (
              <div className="crypto-lab__output">
                <p className="crypto-lab__label">
                  {fill(t.ciphertext, { bytes: fromBase64(ciphertext).length })}
                </p>
                <pre>{ciphertext}</pre>
                <p className="crypto-lab__note">{t.ciphertextNote}</p>
              </div>
            )}
            {decrypted !== null && (
              <div className="crypto-lab__output">
                <p className="crypto-lab__label">{t.decrypted}</p>
                <p className="crypto-lab__good">{decrypted}</p>
              </div>
            )}
            {wrongKeyFailed && <p className="crypto-lab__bad">{t.wrongKeyFailed}</p>}
          </section>

          <section className="crypto-lab__part" aria-labelledby={`${ids}-sign`}>
            <h3 id={`${ids}-sign`}>{t.signTitle}</h3>
            <p className="crypto-lab__intro">{t.signIntro}</p>
            <button type="button" onClick={generateForSigning}>
              {t.generate}
            </button>
            {signingKeys && (
              <div className="crypto-lab__keys">
                <KeyBox label={t.publicKey} pem={signingKeys.publicPem} t={t} />
              </div>
            )}
            <label className="crypto-lab__field">
              <span>{t.toSign}</span>
              <textarea
                rows={2}
                value={toSign}
                onChange={(event) => {
                  // The signature was for another message: it no longer applies.
                  setToSign(event.target.value);
                  setSignature(null);
                  setReceived('');
                  setVerdict(null);
                }}
              />
            </label>
            <div className="crypto-lab__actions">
              <button
                type="button"
                className="crypto-lab__primary"
                disabled={!signingKeys}
                onClick={signMessage}
              >
                {t.sign}
              </button>
            </div>
            {signature && (
              <>
                <div className="crypto-lab__output">
                  <p className="crypto-lab__label">
                    {fill(t.signature, { bytes: fromBase64(signature).length })}
                  </p>
                  <pre>{signature}</pre>
                </div>
                <label className="crypto-lab__field">
                  <span>{t.received}</span>
                  <textarea
                    rows={2}
                    value={received}
                    onChange={(event) => {
                      setReceived(event.target.value);
                      setVerdict(null);
                    }}
                  />
                </label>
                <div className="crypto-lab__actions">
                  <button type="button" className="crypto-lab__primary" onClick={verifyMessage}>
                    {t.verify}
                  </button>
                </div>
                {verdict !== null && (
                  <p className={verdict ? 'crypto-lab__good' : 'crypto-lab__bad'}>
                    <span aria-hidden="true">{verdict ? '✓ ' : '✕ '}</span>
                    {verdict ? t.valid : t.invalid}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
