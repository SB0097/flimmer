import { masterForHeight, parseVariants, qualityOptions } from '../hls';

const MASTER = `#EXTM3U
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:URI="https://g/audio-low",TYPE=AUDIO,GROUP-ID="233",NAME="Default"
#EXT-X-MEDIA:URI="https://g/audio-high",TYPE=AUDIO,GROUP-ID="234",NAME="Default"
#EXT-X-STREAM-INF:BANDWIDTH=206063,CODECS="avc1.4D4015,mp4a.40.5",RESOLUTION=426x240,FRAME-RATE=30,AUDIO="233"
https://g/240
#EXT-X-STREAM-INF:BANDWIDTH=1410056,CODECS="avc1.4D4020,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=60,AUDIO="234"
https://g/720-avc
#EXT-X-STREAM-INF:BANDWIDTH=1210056,CODECS="vp09.00.31.08,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=60,AUDIO="234"
https://g/720-vp9
#EXT-X-STREAM-INF:BANDWIDTH=2637165,CODECS="avc1.64002A,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=60,AUDIO="234"
https://g/1080
`;

describe('parseVariants', () => {
  it('liest alle Varianten mit Höhe, Bandbreite und Bildrate', () => {
    const variants = parseVariants(MASTER);
    expect(variants).toHaveLength(4);
    expect(variants[0]).toMatchObject({
      uri: 'https://g/240',
      height: 240,
      bandwidth: 206063,
      frameRate: 30,
    });
    expect(variants[3]).toMatchObject({ uri: 'https://g/1080', height: 1080 });
  });

  it('kommt mit leeren oder kaputten Listen zurecht', () => {
    expect(parseVariants('')).toEqual([]);
    expect(parseVariants('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n')).toEqual([]);
  });
});

describe('qualityOptions', () => {
  it('liefert eindeutige Qualitäten, höchste zuerst, mit 60-fps-Kennzeichnung', () => {
    expect(qualityOptions(parseVariants(MASTER))).toEqual([
      { height: 1080, label: '1080p60' },
      { height: 720, label: '720p60' },
      { height: 240, label: '240p' },
    ]);
  });
});

describe('masterForHeight', () => {
  it('behält Kopf und Tonspuren, aber nur Varianten der gewählten Höhe', () => {
    const result = masterForHeight(MASTER, 720);
    expect(result).toContain('#EXTM3U');
    expect(result).toContain('https://g/audio-low');
    expect(result).toContain('https://g/audio-high');
    expect(result).toContain('https://g/720-avc');
    expect(result).toContain('https://g/720-vp9');
    expect(result).not.toContain('https://g/240');
    expect(result).not.toContain('https://g/1080');
    expect(parseVariants(result).map((v) => v.height)).toEqual([720, 720]);
  });
});
