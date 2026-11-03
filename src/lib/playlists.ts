export const MAX_PLAYLIST_NAME = 100;

/** Momentaufnahme beim Start: spätere Änderungen an der Sammlung springen nicht im Player. */
export interface PlaybackQueue {
  id: string;
  name: string;
  videoIds: string[];
}

export function playlistName(value: string): string {
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Gib deiner Playlist einen Namen.');
  if (name.length > MAX_PLAYLIST_NAME)
    throw new Error(`Der Name darf höchstens ${MAX_PLAYLIST_NAME} Zeichen lang sein.`);
  return name;
}

/** Kein Überlaufen am Listenende und kein automatischer Neustart. */
export function playlistNeighbor(ids: readonly string[], current: string, step: -1 | 1) {
  const index = ids.indexOf(current);
  return index < 0 ? undefined : ids[index + step];
}
