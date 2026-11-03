/** Wählbare Zeiten für den Sleep-Timer in Minuten */
export const SLEEP_OPTIONS = [10, 15, 20, 30, 45, 60, 90] as const;

/** In den letzten Sekunden wird der Ton sanft leiser */
export const FADE_MS = 10_000;

export type SleepStep =
  { action: 'none' } | { action: 'fade'; volume: number } | { action: 'stop' };

/** Was der Player bei verbleibender Zeit `remainingMs` tun soll */
export function sleepStep(remainingMs: number): SleepStep {
  if (remainingMs <= 0) return { action: 'stop' };
  if (remainingMs < FADE_MS) {
    return { action: 'fade', volume: Math.max(0.05, remainingMs / FADE_MS) };
  }
  return { action: 'none' };
}

/** „noch 14 Min.“ / „noch 45 Sek.“ */
export function remainingLabel(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds < 60) return `noch ${seconds} Sek.`;
  return `noch ${Math.ceil(seconds / 60)} Min.`;
}

/** Eingestellter Sleep-Timer: feste Zeit oder bis zum Ende des aktuellen Videos */
export type SleepTimer = { kind: 'time'; endsAt: number } | { kind: 'endOfVideo'; videoId: string };

/** Restzeit in ms bis zum Pausieren; undefined, wenn (noch) nicht bestimmbar (z. B. Livestream) */
export function sleepRemainingMs(
  timer: SleepTimer,
  now: number,
  currentTime: number,
  duration: number,
): number | undefined {
  if (timer.kind === 'time') return timer.endsAt - now;
  if (!(duration > 0) || !Number.isFinite(duration)) return undefined;
  return (duration - currentTime) * 1000;
}
