import { waitFor } from '@testing-library/react-native';
import { DownloadManager, type DownloadBackend, type DownloadEntry } from '../manager';

const video = (id: string) => ({
  id,
  title: id,
  channel: { id: 'UC', name: 'Kanal' },
  thumbnails: [],
  isLive: false,
});
const result = { entry: 'index.m3u8', contentType: 'hls' as const, label: '720p', bytes: 123 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function setup(initial: DownloadEntry[] = []) {
  let persisted = structuredClone(initial);
  let nextId = 0;
  const backend: jest.Mocked<DownloadBackend> = {
    load: jest.fn(() => structuredClone(persisted)),
    save: jest.fn((items) => {
      persisted = structuredClone(items);
    }),
    uuid: jest.fn(() => `job-${++nextId}`),
    run: jest.fn<ReturnType<DownloadBackend['run']>, Parameters<DownloadBackend['run']>>(
      async () => result,
    ),
    remove: jest.fn<ReturnType<DownloadBackend['remove']>, Parameters<DownloadBackend['remove']>>(
      async () => {},
    ),
    exists: jest.fn<ReturnType<DownloadBackend['exists']>, Parameters<DownloadBackend['exists']>>(
      async () => true,
    ),
    uri: jest.fn((item) => `file:///downloads/${item.id}/${item.entry}`),
  };
  return { backend, manager: new DownloadManager(backend) };
}
const entry = (status: DownloadEntry['status']): DownloadEntry => ({
  id: 'saved',
  video: video('a'),
  mode: 'video',
  quality: 720,
  status,
  createdAt: 1,
  progress: 0,
  ...result,
});

it('serialisiert Jobs und markiert erst nach vollständigem Ergebnis als abspielbar', async () => {
  const { backend, manager } = setup();
  const first = deferred<typeof result>();
  backend.run.mockImplementationOnce(async (_item, _signal, progress) => {
    progress(20, 0.5);
    return first.promise;
  });
  const a = manager.add(video('a'), 'video', 720);
  manager.add(video('b'), 'audio', 360);
  await waitFor(() => expect(backend.run).toHaveBeenCalledTimes(1));
  expect(manager.find('a')).toBeUndefined();
  expect(manager.get().items[0]).toMatchObject({
    id: a,
    bytes: 20,
    progress: 0.5,
    status: 'downloading',
  });
  first.resolve(result);
  await waitFor(() => expect(manager.get().items.every((i) => i.status === 'ready')).toBe(true));
  expect(backend.run.mock.calls.map(([item]) => item.video.id)).toEqual(['a', 'b']);
  expect((await manager.playback('a'))?.source.uri).toMatch(/^file:/);
  expect(new DownloadManager(backend).find('a')?.status).toBe('ready');
});

it('verwirft späte erfolgreiche Ergebnisse nach Abbrechen und startet danach den nächsten Job', async () => {
  const { backend, manager } = setup();
  const first = deferred<typeof result>();
  backend.run.mockImplementationOnce(() => first.promise);
  const id = manager.add(video('a'), 'video', 720);
  manager.add(video('b'), 'video', 360);
  await waitFor(() => expect(backend.run).toHaveBeenCalledTimes(1));
  const cancelled = manager.cancel(id);
  expect(backend.run.mock.calls[0][1].aborted).toBe(true);
  first.resolve(result);
  await cancelled;
  await waitFor(() => expect(manager.find('b')).toBeDefined());
  expect(manager.get().items[0].status).toBe('cancelled');
  expect(manager.find('a')).toBeUndefined();
  expect(backend.remove).toHaveBeenCalledWith(id);
});

it('überspringt abgebrochene wartende Jobs und verhindert doppelte Einträge', async () => {
  const { backend, manager } = setup();
  const first = deferred<typeof result>();
  backend.run.mockImplementationOnce(() => first.promise);
  manager.add(video('a'), 'video', 720);
  const b = manager.add(video('b'), 'video', 360);
  expect(manager.add(video('a'), 'video', 720)).toBe('job-1');
  await manager.cancel(b);
  first.resolve(result);
  await waitFor(() => expect(manager.find('a')).toBeDefined());
  expect(backend.run).toHaveBeenCalledTimes(1);
});

it('stellt nach Neustart unterbrochene Jobs dar und startet sie nur ausdrücklich erneut', async () => {
  const { manager, backend } = setup([entry('downloading')]);
  expect(manager.get().items[0].status).toBe('interrupted');
  expect(backend.run).not.toHaveBeenCalled();
  await Promise.all([manager.retry('saved'), manager.retry('saved')]);
  await waitFor(() => expect(manager.find('a')).toBeDefined());
  expect(backend.run).toHaveBeenCalledTimes(1);
});

it('bereinigt Fehler, ermöglicht erneutes Laden und verändert beim Löschen keine Bibliothek', async () => {
  const { manager, backend } = setup();
  backend.run.mockRejectedValueOnce(new Error('HTTP 403'));
  const id = manager.add(video('a'), 'video', 720);
  await waitFor(() => expect(manager.get().items[0].status).toBe('error'));
  expect(manager.get().items[0].error).toBe('HTTP 403');
  await manager.retry(id);
  await waitFor(() => expect(manager.find('a')).toBeDefined());
  await manager.remove(id);
  expect(manager.get().items).toEqual([]);
  expect(new DownloadManager(backend).get().items).toEqual([]);
});

it('hält nach Speicherfehlern an und macht fehlende Dateien nicht abspielbar', async () => {
  const { backend, manager } = setup([entry('ready')]);
  backend.exists.mockResolvedValue(false);
  await expect(manager.playback('a')).rejects.toThrow(/Dateien fehlen/);
  expect(manager.find('a')).toBeUndefined();
  backend.save.mockImplementation(() => {
    throw new Error('Disk full');
  });
  expect(() => manager.add(video('b'), 'audio', 720)).toThrow('Disk full');
  expect(manager.get().items).toHaveLength(1);
});

it('lässt Audio explizit auswählen und bevorzugt sonst das Video', async () => {
  const audio = { ...entry('ready'), id: 'audio', mode: 'audio' as const };
  const { manager } = setup([audio, entry('ready')]);
  expect(manager.find('a')?.id).toBe('saved');
  expect((await manager.playback('a', 'audio'))?.source.uri).toContain('/audio/');
  await expect(manager.playback('a', 'missing')).rejects.toThrow(/nicht mehr/);
  expect(() => manager.add({ ...video('live'), isLive: true }, 'video', 720)).toThrow(/Livestream/);
});

it('löscht nach einem zeitgleichen Neustart keinen gerade neu angelegten Download', async () => {
  const { manager, backend } = setup([entry('interrupted')]);
  const cleanup = deferred<void>();
  backend.remove.mockImplementationOnce(() => cleanup.promise);
  const retry = manager.retry('saved');
  const remove = manager.remove('saved');
  cleanup.resolve();
  await Promise.all([retry, remove]);
  expect(manager.get().items).toEqual([]);
});
