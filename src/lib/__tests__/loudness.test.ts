import { loudnessGainDb, MAX_LOUDNESS_GAIN_DB } from '../loudness';

describe('loudnessGainDb', () => {
  it('hebt leise Videos auf die YouTube-Bezugslautheit an', () => {
    expect(loudnessGainDb(-18.48, true)).toBe(4.5);
    expect(loudnessGainDb(-16.28, true)).toBe(2.3);
  });

  it('senkt laute Videos nicht ab', () => {
    expect(loudnessGainDb(-14, true)).toBe(0);
    expect(loudnessGainDb(-9.5, true)).toBe(0);
  });

  it('begrenzt die Anhebung bei sehr leisen Videos', () => {
    expect(loudnessGainDb(-23.33, true)).toBe(9.3);
    expect(loudnessGainDb(-40, true)).toBe(MAX_LOUDNESS_GAIN_DB);
  });

  it('bleibt ohne Messwert oder bei ausgeschaltetem Ausgleich neutral', () => {
    expect(loudnessGainDb(undefined, true)).toBe(0);
    expect(loudnessGainDb(Number.NaN, true)).toBe(0);
    expect(loudnessGainDb(-20, false)).toBe(0);
  });
});
