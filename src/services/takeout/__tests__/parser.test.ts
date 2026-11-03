/** @jest-environment node */
import { strToU8, zipSync } from 'fflate';
import { parseCsv } from '../csv';
import { parseTakeout, watchDate } from '../parser';

const uc = 'UC' + 'a'.repeat(22);
const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });
const activity = (id: string, time: string, title = 'Watched Test & Video') => ({
  title,
  titleUrl: `https://www.youtube.com/watch?v=${id}`,
  time,
  subtitles: [{ name: 'Kanal', url: `https://www.youtube.com/channel/${uc}` }],
});

it('liest echte CSV-Zitatregeln mit BOM, Umlauten, CRLF und Zeilenumbrüchen', () => {
  expect(parseCsv('\uFEFFId,Name\r\n1,"Grüße, \"\"du\"\"\nWelt"\r\n')).toEqual([
    ['Id', 'Name'],
    ['1', 'Grüße, "du"\nWelt'],
  ]);
  expect(() => parseCsv('A,"kaputt')).toThrow(/unvollständig/);
});

it('importiert Abos, dedupliziert Verlauf nach neuestem Zeitpunkt und liest alte Playlist-CSV', () => {
  const batch = parseTakeout([
    file(
      'subscriptions.csv',
      `Channel Id,Channel Url,Channel Title\n${uc},https://www.youtube.com/channel/${uc},"Kanal, A"\n${uc},,Kanal\ninvalid,,Falsch`,
    ),
    file(
      'watch-history.json',
      JSON.stringify([
        activity('jNQXAC9IVRw', '2026-11-02T12:00:00Z'),
        activity('jNQXAC9IVRw', '2026-11-03T12:00:00Z'),
        { title: 'Deleted video' },
      ]),
    ),
    file(
      'Liste.csv',
      'Playlist Id,Channel Id,Title\nPL1234567890,UC123,Meine Liste\n\nVideo Id,Time Added\njNQXAC9IVRw,2026-11-02\nM7lc1UVf-VE,2026-11-03\njNQXAC9IVRw,2026-11-04',
    ),
  ]);
  expect(batch.subscriptions).toEqual([{ id: uc, name: 'Kanal' }]);
  expect(batch.history).toHaveLength(1);
  expect(batch.history[0]).toMatchObject({
    watchedAt: Date.parse('2026-11-03T12:00:00Z'),
    video: { title: 'Test & Video', channel: { id: uc } },
  });
  expect(batch.playlists[0]).toMatchObject({ key: 'id:PL1234567890', name: 'Meine Liste' });
  expect(batch.playlists[0].videos.map((v) => v.id)).toEqual(['jNQXAC9IVRw', 'M7lc1UVf-VE']);
});

it('liest neue Playlist-Videolisten und überspringt ungültige Video-IDs', () => {
  const batch = parseTakeout([
    file(
      'Für später-videos.csv',
      'Video Id,Time Added\njNQXAC9IVRw,2026-01-01\nkein-video,2026-01-01',
    ),
  ]);
  expect(batch.playlists[0].name).toBe('Für später');
  expect(batch.playlists[0].videos[0].title).toContain('jNQXAC9IVRw');
  expect(batch.playlists[0].videos).toHaveLength(1);
});

it('liest HTML ohne Ausführung von Skripten, dekodiert Entities und behält deutsche Zeitpunkte', () => {
  const html = `<html><body><div class="outer-cell mdl-cell"><div class="content-cell">Angesehen: <a href="https://www.youtube.com/watch?v=jNQXAC9IVRw">Grüße &amp; mehr</a><br><a href="https://www.youtube.com/channel/${uc}">Kanal &#65;</a><br>03.11.2026, 12:30:00 MEZ</div><script>throw new Error('nicht ausführen')</script></div></body></html>`;
  const batch = parseTakeout([file('Wiedergabeverlauf.html', html)]);
  expect(batch.history).toHaveLength(1);
  expect(batch.history[0]).toMatchObject({
    watchedAt: Date.parse('2026-11-03T11:30:00Z'),
    video: { title: 'Grüße & mehr', channel: { name: 'Kanal A' } },
  });
});

it('verarbeitet ZIP ausschließlich im Speicher und ignoriert andere Daten und Suchverlauf', () => {
  const bytes = zipSync({
    'Takeout/YouTube and YouTube Music/history/watch-history.json': strToU8(
      JSON.stringify([activity('jNQXAC9IVRw', '2026-11-03T12:00:00Z')]),
    ),
    'Takeout/YouTube and YouTube Music/history/search-history.json': strToU8(
      JSON.stringify([activity('M7lc1UVf-VE', '2026-11-03T12:00:00Z')]),
    ),
    '../../fremde-datei.txt': strToU8('nichts speichern'),
    'Fotos/foto.jpg': new Uint8Array(100),
  });
  const batch = parseTakeout([{ name: 'takeout.zip', bytes }]);
  expect(batch.history.map((h) => h.video.id)).toEqual(['jNQXAC9IVRw']);
});

it('begrenzt ZIP-Einträge schon vor dem Entpacken und weist falsche Daten zurück', () => {
  const bytes = zipSync({ 'watch-history.json': strToU8('[]') });
  // Deklarierte entpackte Größe im Central Directory: kein großer Puffer wird angelegt.
  const index = bytes.findIndex(
    (_, i) =>
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2,
  );
  new DataView(bytes.buffer).setUint32(index + 24, 100 * 1024 * 1024, true);
  expect(() => parseTakeout([{ name: 'zu-gross.zip', bytes }])).toThrow(/groß/);
  expect(() => parseTakeout([file('watch-history.json', '{kaputt')])).toThrow(/JSON/);
  expect(() => parseTakeout([file('andere.json', '{}')])).toThrow(/Keine unterstützten/);
  expect(() =>
    parseTakeout([
      file(
        'search-history.json',
        JSON.stringify([activity('jNQXAC9IVRw', '2026-11-03T12:00:00Z')]),
      ),
    ]),
  ).toThrow(/Keine unterstützten/);
});

it('begrenzt den Verlauf auf 1.000 Videos und kennzeichnet unbekannte Datumsformate', () => {
  const activities = Array.from({ length: 1002 }, (_, i) =>
    activity(
      String(i).padStart(11, '0'),
      i ? new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() : 'unbekannt',
    ),
  );
  const batch = parseTakeout([file('watch-history.json', JSON.stringify(activities))]);
  expect(batch.history).toHaveLength(1000);
  expect(batch.warnings.join()).toContain('1.000');
  const unknown = parseTakeout([file('watch-history.json', JSON.stringify([activities[0]]))]);
  expect(unknown.history[0].watchedAt).toBe(0);
  expect(unknown.warnings.join()).toContain('Zeitpunkt');
  expect(watchDate('31.02.2026, 12:00:00 MEZ')).toBe(0);
  expect(watchDate('03.11.2026, 12:99:00 MEZ')).toBe(0);
  expect(watchDate('Nov 3, 2026, 12:30:00 PM CET')).toBe(Date.parse('2026-11-03T11:30:00Z'));
});
