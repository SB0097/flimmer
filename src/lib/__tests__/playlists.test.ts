import { playlistName, playlistNeighbor } from '../playlists';

it('normalisiert Namen und erhält Unicode und Satzzeichen', () => {
  expect(playlistName('  Musik \n für   später 🎵  ')).toBe('Musik für später 🎵');
  expect(playlistName("Meine 'Lieblingsvideos'")).toBe("Meine 'Lieblingsvideos'");
});

it('verhindert leere und zu lange Namen', () => {
  expect(() => playlistName(' \n\t ')).toThrow('Namen');
  expect(() => playlistName('x'.repeat(101))).toThrow('100');
  expect(playlistName('x'.repeat(100))).toHaveLength(100);
});

it('wechselt vorwärts und rückwärts, ohne am Listenende neu zu starten', () => {
  expect(playlistNeighbor(['a', 'b', 'c'], 'b', 1)).toBe('c');
  expect(playlistNeighbor(['a', 'b', 'c'], 'b', -1)).toBe('a');
  expect(playlistNeighbor(['a', 'b', 'c'], 'c', 1)).toBeUndefined();
  expect(playlistNeighbor(['a', 'b', 'c'], 'a', -1)).toBeUndefined();
  expect(playlistNeighbor(['a'], 'fehlt', 1)).toBeUndefined();
  expect(playlistNeighbor([], 'a', 1)).toBeUndefined();
});
