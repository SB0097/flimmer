/**
 * Tipp-Logik des Players wie bei YouTube:
 * - einmal tippen → Steuerung sofort ein-/ausblenden
 * - links/rechts doppeltippen → 10 s zurück/vor
 * - danach jeder weitere Tipp auf derselben Seite (solange der Spul-Modus läuft) → weitere 10 s
 */

export type Side = 'left' | 'center' | 'right';

export interface TapSeekOptions {
  /** Maximaler Abstand zweier Tipps für einen Doppeltipp */
  doubleTapMs: number;
  /** Wie lange nach dem letzten Spul-Tipp weitere Einzeltipps weiterspulen */
  seekModeMs: number;
  /** Sekunden pro Spul-Schritt */
  step: number;
}

export const DEFAULT_TAP_SEEK: TapSeekOptions = { doubleTapMs: 300, seekModeMs: 800, step: 10 };

export interface TapState {
  lastTapAt?: number;
  lastSide?: Side;
  seekMode?: { side: 'left' | 'right'; until: number; total: number };
}

export type TapAction =
  /** Sofort spulen; `total` = bisher in dieser Serie gespulte Sekunden (für die Anzeige) */
  | { type: 'seek'; side: 'left' | 'right'; seconds: number; total: number }
  /** Einzeltipp (kann der erste Tipp eines Doppeltipps sein) */
  | { type: 'single-pending' };

/** Linkes und rechtes Drittel spulen, die Mitte nie */
export function sideOf(x: number, width: number): Side {
  if (width <= 0) return 'center';
  const f = x / width;
  if (f < 0.35) return 'left';
  if (f > 0.65) return 'right';
  return 'center';
}

export function handleTap(
  state: TapState,
  now: number,
  side: Side,
  options: TapSeekOptions = DEFAULT_TAP_SEEK,
): { state: TapState; action: TapAction } {
  const { doubleTapMs, seekModeMs, step } = options;

  // 1. Spul-Modus läuft und es wird wieder auf dieselbe Seite getippt → weiterspulen
  const mode = state.seekMode;
  if (mode && now <= mode.until && side === mode.side) {
    const total = mode.total + step;
    return {
      state: { seekMode: { side, until: now + seekModeMs, total } },
      action: { type: 'seek', side, seconds: side === 'left' ? -step : step, total },
    };
  }

  // 2. Doppeltipp auf linker oder rechter Seite → Spul-Modus starten
  const isDouble =
    state.lastTapAt !== undefined &&
    now - state.lastTapAt <= doubleTapMs &&
    state.lastSide === side;
  if (isDouble && side !== 'center') {
    return {
      state: { seekMode: { side, until: now + seekModeMs, total: step } },
      action: { type: 'seek', side, seconds: side === 'left' ? -step : step, total: step },
    };
  }

  // 3. Sonst: Einzeltipp vormerken
  return { state: { lastTapAt: now, lastSide: side }, action: { type: 'single-pending' } };
}

/** Ziel-Zeitpunkt beim Spulen, begrenzt auf [0, duration] */
export function clampSeekTarget(current: number, seconds: number, duration: number): number {
  const target = current + seconds;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, target);
  return Math.min(Math.max(0, target), duration);
}
