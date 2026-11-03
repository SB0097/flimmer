/**
 * SponsorBlock-Segmente: Datentypen, Kategorien und die Logik, wann
 * übersprungen wird. Bewusst ohne React/Expo, damit alles testbar ist.
 */

export const SEGMENT_CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
  'preview',
  'music_offtopic',
  'filler',
] as const;

export type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number];

/** auto = automatisch überspringen, manual = Knopf anzeigen, off = ignorieren */
export type CategoryMode = 'auto' | 'manual' | 'off';

export type SponsorSettings = Record<SegmentCategory, CategoryMode>;

export interface Segment {
  uuid: string;
  start: number;
  end: number;
  category: SegmentCategory;
}

export const DEFAULT_SPONSOR_SETTINGS: SponsorSettings = {
  sponsor: 'auto',
  selfpromo: 'auto',
  interaction: 'manual',
  intro: 'manual',
  outro: 'manual',
  preview: 'off',
  music_offtopic: 'off',
  filler: 'off',
};

/** Bezeichnungen und Farben wie bei der SponsorBlock-Erweiterung */
export const CATEGORY_INFO: Record<
  SegmentCategory,
  { label: string; short: string; color: string }
> = {
  sponsor: { label: 'Sponsor', short: 'Sponsor', color: '#00D400' },
  selfpromo: { label: 'Eigenwerbung', short: 'Eigenwerbung', color: '#FFFF00' },
  interaction: {
    label: 'Interaktions-Aufruf (Abonnieren usw.)',
    short: 'Interaktion',
    color: '#CC00FF',
  },
  intro: { label: 'Intro / Pause', short: 'Intro', color: '#00FFFF' },
  outro: { label: 'Outro / Abspann', short: 'Outro', color: '#0202ED' },
  preview: { label: 'Vorschau / Rückblick', short: 'Vorschau', color: '#008FD6' },
  music_offtopic: { label: 'Musik: kein Musikteil', short: 'Kein Musikteil', color: '#FF9900' },
  filler: { label: 'Füllmaterial / Abschweifung', short: 'Füllmaterial', color: '#7300FF' },
};

function isCategory(value: unknown): value is SegmentCategory {
  return typeof value === 'string' && (SEGMENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Liest die Antwort von /api/skipSegments/{hashPrefix}: eine Liste von Videos
 * (alle mit gleichem Hash-Präfix), daraus nur das gesuchte Video.
 */
export function parseSegments(json: unknown, videoId: string): Segment[] {
  if (!Array.isArray(json)) return [];
  const entry = json.find((v) => v && typeof v === 'object' && v.videoID === videoId) as
    { segments?: unknown[] } | undefined;

  return (entry?.segments ?? [])
    .map((raw) => {
      const s = raw as {
        UUID?: string;
        segment?: number[];
        category?: string;
        actionType?: string;
      };
      const [start, end] = s.segment ?? [];
      if (
        s.actionType !== 'skip' ||
        !isCategory(s.category) ||
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        end - start < 0.5
      ) {
        return undefined;
      }
      return { uuid: s.UUID ?? `${s.category}-${start}`, start, end, category: s.category };
    })
    .filter((s): s is Segment => s !== undefined)
    .sort((a, b) => a.start - b.start);
}

/** Toleranz, damit kurz vor dem Ende nicht noch gesprungen wird */
const END_MARGIN = 0.3;

function inside(segment: Segment, time: number) {
  return time >= segment.start && time < segment.end - END_MARGIN;
}

/**
 * Wohin automatisch gesprungen werden soll. Direkt aneinander anschließende
 * Auto-Segmente (z. B. Sponsor, danach Intro) werden in einem Sprung übersprungen.
 * Bereits übersprungene Segmente (z. B. nach „Rückgängig“) bleiben unangetastet.
 */
export function autoSkip(
  segments: Segment[],
  time: number,
  settings: SponsorSettings,
  skipped: ReadonlySet<string>,
): { to: number; segments: Segment[] } | undefined {
  const auto = segments.filter((s) => settings[s.category] === 'auto' && !skipped.has(s.uuid));
  const first = auto.find((s) => inside(s, time));
  if (!first) return undefined;

  const chain = [first];
  let to = first.end;
  let extended = true;
  while (extended) {
    extended = false;
    for (const s of auto) {
      if (!chain.includes(s) && s.start <= to + 1 && s.end > to) {
        chain.push(s);
        to = s.end;
        extended = true;
      }
    }
  }
  return { to, segments: chain };
}

/** Segment, für das gerade ein „Überspringen“-Knopf gezeigt werden soll */
export function manualSegmentAt(
  segments: Segment[],
  time: number,
  settings: SponsorSettings,
): Segment | undefined {
  return segments.find((s) => settings[s.category] === 'manual' && inside(s, time));
}

/**
 * Segmente, vor deren Anfang man (z. B. per Zurückspulen) wieder steht, sind
 * erneut „scharf“ und werden beim nächsten Erreichen wieder übersprungen.
 * Gibt die UUIDs zurück, die aus `skipped` entfernt werden sollen.
 */
export function rearmable(
  segments: Segment[],
  time: number,
  skipped: ReadonlySet<string>,
  margin = 1,
): string[] {
  const done = segments.filter((s) => skipped.has(s.uuid));
  // Steht man in einem übersprungenen Segment (z. B. nach „Rückgängig“ einer
  // Kette), bleibt alles markiert – sonst würde der Rest der Kette erneut springen.
  if (done.some((s) => time >= s.start && time < s.end)) return [];
  return done.filter((s) => time < s.start - margin).map((s) => s.uuid);
}
