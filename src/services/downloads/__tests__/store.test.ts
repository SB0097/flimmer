import { waitFor } from '@testing-library/react-native';
import * as FS from 'expo-file-system/legacy';
import { videoSource } from '@/services/video-source';
import { downloads } from '../store';

const mockFiles = new Map<string, number>();
let mockState: string | undefined;
let mockCounter = 0;
const mockTransfer = jest.fn(async (uri: string) => ({
  status: 200,
  size: uri.includes('audio') ? 20 : 40,
  headers: {} as Record<string, string>,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => `job-${++mockCounter}` }));
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    getFirstSync: () => (mockState ? { json: mockState } : null),
    runSync: (_sql: string, json: string) => {
      mockState = json;
    },
  }),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/',
  getFreeDiskStorageAsync: jest.fn(async () => 1024 * 1024 * 1024),
  deleteAsync: jest.fn(async (uri: string) => {
    for (const path of mockFiles.keys()) if (path.startsWith(uri)) mockFiles.delete(path);
  }),
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async (uri: string, value: string) => {
    mockFiles.set(uri, value.length);
  }),
  getInfoAsync: jest.fn(async (uri: string) => ({
    exists: mockFiles.has(uri),
    isDirectory: false,
    size: mockFiles.get(uri) ?? 0,
  })),
  createDownloadResumable: jest.fn(
    (uri: string, path: string, _options: unknown, progress: (event: unknown) => void) => ({
      cancelAsync: jest.fn(async () => {}),
      downloadAsync: async () => {
        const response = await mockTransfer(uri);
        mockFiles.set(path, response.size);
        progress({ totalBytesWritten: response.size, totalBytesExpectedToWrite: response.size });
        return { status: response.status, uri: path, headers: response.headers };
      },
    }),
  ),
}));
jest.mock('@/services/video-source', () => ({ videoSource: { getStreams: jest.fn() } }));
jest.mock('@/services/sponsorblock/sponsorblock', () => ({
  fetchSegments: jest.fn(async () => []),
}));

const video = (id: string) => ({
  id,
  title: id,
  isLive: false,
  channel: { id: 'UC', name: 'Kanal' },
  thumbnails: [],
});
const master =
  '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,NAME="Audio",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,AUDIO="a"\nvideo.m3u8\n';
const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = fetchMock;
});
afterAll(() => {
  global.fetch = originalFetch;
});
beforeEach(async () => {
  for (const item of downloads.get().items) await downloads.remove(item.id);
  jest.clearAllMocks();
  mockFiles.clear();
  mockTransfer.mockImplementation(async (uri) => ({
    status: 200,
    size: uri.includes('audio') ? 20 : 40,
    headers: {},
  }));
  jest.mocked(FS.getFreeDiskStorageAsync).mockResolvedValue(1024 * 1024 * 1024);
  jest.mocked(videoSource.getStreams).mockImplementation(async (id) => ({
    source: {
      uri: 'https://cdn.example/master.m3u8',
      contentType: 'hls',
      via: 'VISIONOS',
      headers: { Test: 'header' },
    },
    details: { ...video(id), description: 'Beschreibung' },
    attempts: [],
  }));
  fetchMock.mockImplementation(async (uri: string) => ({
    ok: true,
    url: uri,
    text: async () =>
      uri.endsWith('master.m3u8')
        ? master
        : `#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\n${uri.includes('audio') ? 'audio.ts' : 'video.ts'}\n#EXT-X-ENDLIST\n`,
  }));
});

it('speichert beide Spuren und lokale Manifeste, bevor der Download fertig wird', async () => {
  downloads.add(video('complete'), 'video', 720);
  await waitFor(() => expect(downloads.find('complete')).toBeDefined());
  expect(mockTransfer.mock.calls.map(([uri]) => uri)).toEqual([
    'https://cdn.example/audio.ts',
    'https://cdn.example/video.ts',
  ]);
  const saved = downloads.find('complete')!;
  expect(saved.bytes).toBe(60);
  expect(saved.details?.description).toBe('Beschreibung');
  expect(JSON.parse(mockState!)[0].status).toBe('ready');
  expect((await downloads.playback('complete'))?.source.uri).toMatch(
    /^file:\/\/\/app\/downloads\/job-\d+\/index.m3u8$/,
  );
  for (const [, text] of jest.mocked(FS.writeAsStringAsync).mock.calls)
    expect(text).not.toContain('https://');
});

it('lädt bei Audio nur die Audiospur und kein Videosegment', async () => {
  downloads.add(video('audio'), 'audio', 720);
  await waitFor(() => expect(downloads.find('audio')).toBeDefined());
  expect(mockTransfer).toHaveBeenCalledTimes(1);
  expect(downloads.find('audio')?.entry).toBe('audio.m3u8');
  expect((await downloads.playback('audio'))?.source.contentType).toBe('hls');
});

it.each([403, 404])('entfernt bei HTTP %s alle Teildateien', async (status) => {
  mockTransfer.mockResolvedValue({ status, size: 40, headers: {} });
  downloads.add(video('failed'), 'video', 720);
  await waitFor(() => expect(downloads.get().items[0].status).toBe('error'));
  expect(mockFiles.size).toBe(0);
  expect(downloads.find('failed')).toBeUndefined();
});

it('weist unvollständige Übertragung und zu wenig Speicher zurück', async () => {
  mockTransfer.mockResolvedValue({ status: 200, size: 10, headers: { 'Content-Length': '100' } });
  const id = downloads.add(video('short'), 'video', 720);
  await waitFor(() => expect(downloads.get().items[0].status).toBe('error'));
  expect(downloads.get().items[0].error).toMatch(/vollständig/);
  expect(mockFiles.size).toBe(0);
  jest.mocked(FS.getFreeDiskStorageAsync).mockResolvedValue(1);
  await downloads.retry(id);
  await waitFor(() => expect(downloads.get().items[0].status).toBe('error'));
  expect(downloads.get().items[0].error).toMatch(/Speicherplatz/);
});
