import { Constants } from 'youtubei.js';

/**
 * Aktuellere Client-Kennungen als die in YouTube.js eingebauten.
 *
 * YouTube sperrt ältere App-Versionen regelmäßig. Die Werte orientieren sich an
 * NewPipeExtractor (ClientsConstants.java), das diese Kennungen sehr aktuell hält:
 * https://github.com/TeamNewPipe/NewPipeExtractor/blob/dev/extractor/src/main/java/org/schabi/newpipe/extractor/services/youtube/ClientsConstants.java
 *
 * Stand 01.11.2026: VisionOS 1.04 liefert ohne PoToken vollständig ladbare
 * HLS-Streams für normale Videos und Livestreams (Version 1.02 verlangt einen Login).
 */
export const VISIONOS_OVERRIDE = {
  VERSION: '1.04',
  DEVICE_MODEL: 'RealityDevice17,1',
  OS_VERSION: '26.6.0.23O770',
  USER_AGENT:
    'com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; DE)',
} as const;

let applied = false;

export function applyClientOverrides() {
  if (applied) return;
  const clients = Constants.CLIENTS as unknown as Record<string, Record<string, unknown>>;
  Object.assign(clients.VISIONOS, VISIONOS_OVERRIDE);
  applied = true;
}
