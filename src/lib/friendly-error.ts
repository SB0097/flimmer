export interface FriendlyError {
  title: string;
  hint?: string;
  /** Lohnt sich „Erneut versuchen“? */
  retryable: boolean;
}

interface AttemptLike {
  message: string;
}

/**
 * Übersetzt technische Fehler (YouTube-Status, Netzwerk, Player) in eine
 * verständliche Meldung. Die technischen Details bleiben in der Diagnose.
 */
export function friendlyStreamError(error: unknown, attempts: AttemptLike[] = []): FriendlyError {
  const text = [
    error instanceof Error ? error.message : String(error ?? ''),
    ...attempts.map((a) => a.message),
  ]
    .join('\n')
    .toLowerCase();

  const has = (...needles: string[]) => needles.some((n) => text.includes(n));

  if (
    has(
      'network request failed',
      'failed to fetch',
      'unable to resolve host',
      'timeout',
      'netzwerk',
    )
  ) {
    return { title: 'Keine Verbindung', hint: 'Prüfe deine Internetverbindung.', retryable: true };
  }
  if (has('privat', 'private')) {
    return { title: 'Dieses Video ist privat', retryable: false };
  }
  if (has('mitglied', 'members')) {
    return { title: 'Nur für Kanalmitglieder', retryable: false };
  }
  if (
    has('altersbeschr', 'inappropriate', 'age-restricted', 'age restricted', 'confirm your age')
  ) {
    return {
      title: 'Altersbeschränktes Video',
      hint: 'Ohne Anmeldung lässt sich dieses Video nicht abspielen.',
      retryable: false,
    };
  }
  if (has('land nicht', 'country', 'not available in your')) {
    return { title: 'In deinem Land nicht verfügbar', retryable: false };
  }
  if (has('kein bot', 'not a bot')) {
    return {
      title: 'YouTube blockiert gerade',
      hint: 'YouTube hält dieses Netzwerk für einen Bot. Später erneut versuchen.',
      retryable: true,
    };
  }
  if (has('premiere', 'live event will begin', 'beginnt in')) {
    return {
      title: 'Noch nicht gestartet',
      hint: 'Premiere oder Livestream beginnt später.',
      retryable: true,
    };
  }
  if (has('response code: 403', 'response code: 410')) {
    return {
      title: 'Wiedergabe unterbrochen',
      hint: 'Die Stream-Adresse ist abgelaufen. Erneut versuchen lädt sie neu.',
      retryable: true,
    };
  }
  return { title: 'Video kann gerade nicht abgespielt werden', retryable: true };
}
