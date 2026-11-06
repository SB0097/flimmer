/** Bezugslautheit von YouTube; lautere Videos senkt auch YouTube nur ab, nie Flimmer. */
export const TARGET_LOUDNESS_DB = -14;
/** Mehr Anhebung klingt bei sehr leisen Videos gepresst. */
export const MAX_LOUDNESS_GAIN_DB = 10;

/**
 * Anhebung in dB, damit leise Videos so laut wirken wie in der YouTube-App
 * („Stabile Lautstärke“). Ohne Messwert oder bei ausgeschaltetem Ausgleich 0.
 */
export function loudnessGainDb(loudnessDb: number | undefined, enabled: boolean): number {
  if (!enabled || loudnessDb === undefined || !Number.isFinite(loudnessDb)) return 0;
  const gain = TARGET_LOUDNESS_DB - loudnessDb;
  return Math.round(Math.min(MAX_LOUDNESS_GAIN_DB, Math.max(0, gain)) * 10) / 10;
}
