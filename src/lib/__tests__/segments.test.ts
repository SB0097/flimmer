import {
  autoSkip,
  DEFAULT_SPONSOR_SETTINGS,
  manualSegmentAt,
  parseSegments,
  rearmable,
  type Segment,
} from '../segments';

const API_RESPONSE = [
  {
    videoID: 'anderesVideo',
    segments: [{ UUID: 'x', segment: [1, 5], category: 'sponsor', actionType: 'skip' }],
  },
  {
    videoID: 'g9IOdTisQyM',
    segments: [
      { UUID: 'b', segment: [94.2, 103.1], category: 'intro', actionType: 'skip' },
      { UUID: 'a', segment: [77.0, 94.2], category: 'sponsor', actionType: 'skip' },
      { UUID: 'm', segment: [200, 210], category: 'sponsor', actionType: 'mute' },
      { UUID: 'p', segment: [300, 300], category: 'poi_highlight', actionType: 'poi' },
      { UUID: 'c', segment: [1140, 1152], category: 'selfpromo', actionType: 'skip' },
      { UUID: 'd', segment: [1517, 1533], category: 'outro', actionType: 'skip' },
    ],
  },
];

describe('parseSegments', () => {
  it('nimmt nur das gesuchte Video und nur überspringbare Segmente, sortiert', () => {
    const segments = parseSegments(API_RESPONSE, 'g9IOdTisQyM');
    expect(segments.map((s) => s.uuid)).toEqual(['a', 'b', 'c', 'd']);
    expect(segments[0]).toEqual({ uuid: 'a', start: 77, end: 94.2, category: 'sponsor' });
  });

  it('kommt mit leeren oder kaputten Antworten zurecht', () => {
    expect(parseSegments(undefined, 'x')).toEqual([]);
    expect(parseSegments({ error: true }, 'x')).toEqual([]);
    expect(parseSegments(API_RESPONSE, 'gibtsNicht')).toEqual([]);
  });
});

describe('autoSkip', () => {
  const segments = parseSegments(API_RESPONSE, 'g9IOdTisQyM');
  const allAuto = { ...DEFAULT_SPONSOR_SETTINGS, intro: 'auto' as const };

  it('springt im Sponsor-Teil ans Ende', () => {
    expect(autoSkip(segments, 80, DEFAULT_SPONSOR_SETTINGS, new Set())?.to).toBe(94.2);
  });

  it('überspringt direkt anschließende Auto-Segmente in einem Sprung', () => {
    const result = autoSkip(segments, 80, allAuto, new Set());
    expect(result?.to).toBe(103.1);
    expect(result?.segments.map((s) => s.uuid)).toEqual(['a', 'b']);
  });

  it('springt nicht außerhalb, bei manuellen oder bereits übersprungenen Segmenten', () => {
    expect(autoSkip(segments, 70, DEFAULT_SPONSOR_SETTINGS, new Set())).toBeUndefined();
    expect(autoSkip(segments, 98, DEFAULT_SPONSOR_SETTINGS, new Set())).toBeUndefined(); // Intro = manuell
    expect(autoSkip(segments, 80, DEFAULT_SPONSOR_SETTINGS, new Set(['a']))).toBeUndefined();
  });

  it('springt nicht mehr ganz kurz vor dem Ende', () => {
    expect(autoSkip(segments, 94.0, DEFAULT_SPONSOR_SETTINGS, new Set())).toBeUndefined();
  });
});

describe('manualSegmentAt', () => {
  const segments: Segment[] = parseSegments(API_RESPONSE, 'g9IOdTisQyM');

  it('liefert das manuelle Segment an der aktuellen Stelle', () => {
    expect(manualSegmentAt(segments, 100, DEFAULT_SPONSOR_SETTINGS)?.category).toBe('intro');
    expect(manualSegmentAt(segments, 80, DEFAULT_SPONSOR_SETTINGS)).toBeUndefined(); // Sponsor = auto
    expect(
      manualSegmentAt(segments, 100, { ...DEFAULT_SPONSOR_SETTINGS, intro: 'off' }),
    ).toBeUndefined();
  });
});

describe('rearmable', () => {
  const segs = parseSegments(API_RESPONSE, 'g9IOdTisQyM');
  const skipped = new Set(['a', 'b']);

  it('gibt Segmente frei, wenn man deutlich davor zurückspult', () => {
    expect(rearmable(segs, 60, skipped)).toEqual(['a', 'b']);
    expect(rearmable(segs, 500, new Set(['c']))).toEqual(['c']);
    expect(rearmable(segs, 1139.5, new Set(['c']))).toEqual([]);
  });

  it('lässt Segmente nach „Rückgängig“ (Sprung genau an den Anfang) markiert', () => {
    expect(rearmable(segs, 77, skipped)).toEqual([]);
    expect(rearmable(segs, 85, skipped)).toEqual([]);
  });
});
