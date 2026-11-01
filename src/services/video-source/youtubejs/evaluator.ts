import type { Types } from 'youtubei.js';

type BuildScriptResult = Parameters<Types.PlatformShim['eval']>[0];
type Env = Parameters<Types.PlatformShim['eval']>[1];

/**
 * Führt das von YouTube.js aus dem YouTube-Player extrahierte Skript aus,
 * um Stream-URLs zu entschlüsseln (Signatur und `n`-Parameter).
 *
 * YouTube.js hängt an das Skript eine Funktion `process(n, sp, s)` an, die
 * `{ sig, n }` zurückgibt. Hermes (React Native) und Node unterstützen den
 * Function-Konstruktor, daher reicht hier ein einfacher Aufruf.
 */
export function evaluatePlayerScript(data: BuildScriptResult, env: Env) {
  const args = [env.n ?? '', env.sp ?? '', env.sig ?? ''].map((v) => JSON.stringify(String(v)));
  const run = new Function(`${data.output}\nreturn process(${args.join(', ')});`);
  return run() as Record<string, unknown>;
}
