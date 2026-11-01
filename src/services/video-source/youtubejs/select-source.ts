/** Minimal benötigte Felder der Streaming-Daten (entkoppelt von YouTube.js-Typen) */
export interface StreamingDataLike {
  hls_manifest_url?: string;
  dash_manifest_url?: string;
  adaptive_formats: unknown[];
  formats: { has_audio: boolean; has_video: boolean }[];
}

export type SourcePlan =
  | { kind: 'hls'; uri: string }
  | { kind: 'dash-server'; uri: string }
  | { kind: 'dash-generated' }
  | { kind: 'progressive' }
  | { kind: 'none'; reason: string };

/**
 * Entscheidet, wie ein Video abgespielt wird:
 * 1. HLS-Manifest von YouTube (Livestreams, iOS-Clients)
 * 2. DASH-Manifest von YouTube (vor allem Livestreams)
 * 3. Selbst erzeugtes DASH-Manifest aus den Einzelformaten (nur normale Videos)
 * 4. Kombinierte Datei mit Bild und Ton (niedrige Qualität, letzter Ausweg)
 */
export function planSource(
  data: StreamingDataLike,
  { isLive, canGenerateDash }: { isLive: boolean; canGenerateDash: boolean },
): SourcePlan {
  if (data.hls_manifest_url) return { kind: 'hls', uri: data.hls_manifest_url };
  if (data.dash_manifest_url) return { kind: 'dash-server', uri: data.dash_manifest_url };

  if (isLive) {
    return { kind: 'none', reason: 'Livestream ohne HLS-/DASH-Manifest' };
  }

  if (canGenerateDash && data.adaptive_formats.length > 0) return { kind: 'dash-generated' };
  if (data.formats.some((f) => f.has_audio && f.has_video)) return { kind: 'progressive' };

  return {
    kind: 'none',
    reason: `keine abspielbaren Formate (adaptiv: ${data.adaptive_formats.length}, kombiniert: ${data.formats.length})`,
  };
}
