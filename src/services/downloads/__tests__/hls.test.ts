import { localMedia, planHls } from '../hls';

const base = 'https://example.com/hls/master.m3u8';
const media =
  '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nsegment.ts?token=x\n#EXT-X-ENDLIST\n';
const master = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sound",NAME="Deutsch",DEFAULT=YES,URI="de/audio.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="sound",NAME="English",URI="en/audio.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="subs.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360,AUDIO="sound",SUBTITLES="subs"
360/video.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,AUDIO="sound",SUBTITLES="subs"
720/video.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080,AUDIO="sound"
1080/video.m3u8
`;
const reader = () => jest.fn(async (uri: string) => ({ uri, text: uri === base ? master : media }));

it('speichert genau eine Videoqualität und die zugehörige Standard-Tonspur', async () => {
  const read = reader();
  const plan = await planHls(base, 'video', 720, read);
  expect(read.mock.calls.map(([uri]) => uri)).toEqual([
    base,
    'https://example.com/hls/de/audio.m3u8',
    'https://example.com/hls/720/video.m3u8',
  ]);
  expect(plan.label).toBe('720p');
  expect(plan.resources.map((r) => r.uri)).toEqual([
    'https://example.com/hls/de/segment.ts?token=x',
    'https://example.com/hls/720/segment.ts?token=x',
  ]);
  const localMaster = plan.manifests.find((m) => m.name === plan.entry)!.text;
  expect(localMaster).toContain('URI="audio.m3u8"');
  expect(localMaster).not.toMatch(/https?:|SUBTITLES|English/);
  expect(plan.manifests.every((m) => !m.text.includes('https://'))).toBe(true);
});

it('lädt bei Nur Audio keine Videosegmente', async () => {
  const read = reader();
  const plan = await planHls(base, 'audio', 360, read);
  expect(plan.entry).toBe('audio.m3u8');
  expect(plan.resources).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(plan.resources[0].uri).toContain('/de/');
});

it('wählt bei 360p keine höhere verfügbare Qualität', async () => {
  const plan = await planHls(base, 'video', 360, reader());
  expect(plan.label).toBe('360p');
});

it('löst Segment-, AES-Schlüssel- und Initialisierungsadressen auf und erhält Byte-Ranges', () => {
  const text = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="../key",IV=0x1234
#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"
#EXTINF:10,
#EXT-X-BYTERANGE:100@100
segments.mp4
#EXTINF:10,
#EXT-X-BYTERANGE:100
segments.mp4
#EXT-X-ENDLIST`;
  const result = localMedia(text, base, 'video');
  expect(result.resources.map((r) => r.uri)).toEqual([
    'https://example.com/key',
    'https://example.com/hls/init.mp4',
    'https://example.com/hls/segments.mp4',
  ]);
  expect(result.text).toContain('URI="video-0.bin"');
  expect(result.text).toContain('BYTERANGE="100@0"');
  expect(result.text.match(/video-2.bin/g)).toHaveLength(2);
});

it('weist Live-, DRM-, leere und nicht über HTTP erreichbare Listen zurück', () => {
  expect(() => localMedia(media.replace('#EXT-X-ENDLIST', ''), base, 'x')).toThrow(/live/);
  expect(() =>
    localMedia(
      media.replace('#EXTINF:', '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\n#EXTINF:'),
      base,
      'x',
    ),
  ).toThrow(/Geschützte/);
  expect(() =>
    localMedia(media.replace('segment.ts?token=x', 'file:///etc/example'), base, 'x'),
  ).toThrow(/Adresse/);
  expect(() => localMedia('#EXTM3U\n#EXT-X-ENDLIST', base, 'x')).toThrow(/keine/);
});

it('nutzt die tatsächliche URL nach Weiterleitungen als Basis', async () => {
  const read = jest.fn(async (uri: string) => ({
    uri: 'https://cdn.example/actual/media.m3u8',
    text: media,
  }));
  const plan = await planHls(base, 'video', 720, read);
  expect(plan.resources[0].uri).toBe('https://cdn.example/actual/segment.ts?token=x');
  await expect(planHls(base, 'audio', 720, read)).rejects.toThrow(/Tonspur/);
});
