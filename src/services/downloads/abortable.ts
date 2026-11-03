/** Beendet auch Arbeit ohne eigene Abort-Unterstützung; späte Ergebnisse werden verworfen. */
export function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal,
  timeoutMs = 45_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(new Error('Download abgebrochen.')));
    const timer = setTimeout(
      () =>
        finish(() => reject(new Error('Die Verbindung antwortet nicht. Bitte erneut versuchen.'))),
      timeoutMs,
    );
    const finish = (done: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      done();
    };
    signal.addEventListener('abort', abort);
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
  });
}
