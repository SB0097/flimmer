import { planSource, type StreamingDataLike } from '../select-source';

const base: StreamingDataLike = { adaptive_formats: [], formats: [] };
const vod = { isLive: false, canGenerateDash: true };
const live = { isLive: true, canGenerateDash: true };

describe('planSource', () => {
  it('bevorzugt das HLS-Manifest von YouTube', () => {
    const plan = planSource(
      { ...base, hls_manifest_url: 'https://hls', dash_manifest_url: 'https://dash' },
      live,
    );
    expect(plan).toEqual({ kind: 'hls', uri: 'https://hls' });
  });

  it('nutzt bei Livestreams das DASH-Manifest von YouTube', () => {
    const plan = planSource(
      { ...base, dash_manifest_url: 'https://dash', adaptive_formats: [{}] },
      live,
    );
    expect(plan).toEqual({ kind: 'dash-server', uri: 'https://dash' });
  });

  it('erzeugt bei Livestreams nie selbst ein DASH-Manifest', () => {
    const plan = planSource({ ...base, adaptive_formats: [{}, {}] }, live);
    expect(plan.kind).toBe('none');
  });

  it('erzeugt bei normalen Videos ein DASH-Manifest aus den Einzelformaten', () => {
    expect(planSource({ ...base, adaptive_formats: [{}] }, vod)).toEqual({
      kind: 'dash-generated',
    });
  });

  it('fällt auf kombinierte Formate zurück', () => {
    const plan = planSource(
      { ...base, formats: [{ has_audio: true, has_video: true }] },
      { isLive: false, canGenerateDash: false },
    );
    expect(plan).toEqual({ kind: 'progressive' });
  });

  it('meldet, wenn nichts abspielbar ist', () => {
    expect(planSource(base, vod).kind).toBe('none');
  });
});
