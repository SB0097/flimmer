import { lockupToSummary, parseDurationText, type LockupLike } from '../lockup';

const text = (t: string) => ({ toString: () => t });

function lockup(overrides: Partial<LockupLike> = {}, badge = '2:12:37'): LockupLike {
  return {
    content_id: 'UDTmUzu05BE',
    content_type: 'VIDEO',
    content_image: {
      image: [{ url: 'https://i.ytimg.com/vi/x/hq.jpg', width: 336, height: 188 }],
      overlays: [{ badges: [{ text: badge }] }],
    },
    metadata: {
      title: text('Deep Work Mix'),
      image: { avatar: { image: [{ url: 'https://yt3/avatar', width: 68, height: 68 }] } },
      metadata: {
        metadata_rows: [
          { metadata_parts: [{ text: text('Brainwave Workspace') }] },
          { metadata_parts: [{ text: text('4 Mio.') }, { text: text('vor 7 Monaten') }] },
        ],
      },
    },
    ...overrides,
  };
}

describe('parseDurationText', () => {
  it.each([
    ['4:05', 245],
    ['2:12:37', 7957],
    ['0:59', 59],
  ])('%s → %d', (input, expected) => {
    expect(parseDurationText(input)).toBe(expected);
  });

  it.each(['LIVE', '', undefined, 'Neu'])('ignoriert %s', (input) => {
    expect(parseDurationText(input)).toBeUndefined();
  });
});

describe('lockupToSummary', () => {
  it('liest Aufrufe und Datum auf einer Kanalseite ohne zusätzliche Kanalzeile', () => {
    const node = lockup();
    node.metadata!.metadata!.metadata_rows!.shift();
    const summary = lockupToSummary(node, { id: 'UC-test', name: 'Testkanal' });
    expect(summary?.channel.id).toBe('UC-test');
    expect(summary?.viewCountText).toBe('4 Mio. Aufrufe');
    expect(summary?.publishedText).toBe('vor 7 Monaten');
  });
  it('liest die Kanal-ID aus verlinkten Metadaten', () => {
    const node = lockup();
    node.metadata!.metadata!.metadata_rows![0].metadata_parts![0].text = {
      toString: () => 'Testkanal',
      runs: [{ endpoint: { payload: { browseId: 'UC-test' } } }],
    };
    expect(lockupToSummary(node)?.channel.id).toBe('UC-test');
  });
  it('liest ein normales Video', () => {
    expect(lockupToSummary(lockup())).toEqual({
      id: 'UDTmUzu05BE',
      title: 'Deep Work Mix',
      channel: {
        id: '',
        name: 'Brainwave Workspace',
        avatar: { url: 'https://yt3/avatar', width: 68, height: 68 },
      },
      durationSeconds: 7957,
      viewCountText: '4 Mio. Aufrufe',
      publishedText: 'vor 7 Monaten',
      thumbnails: [{ url: 'https://i.ytimg.com/vi/x/hq.jpg', width: 336, height: 188 }],
      isLive: false,
    });
  });

  it('lässt vollständige Texte wie „aktive Zuschauer“ unverändert', () => {
    const live = lockup();
    live.metadata!.metadata!.metadata_rows![1] = {
      metadata_parts: [{ text: text('10.551 aktive Zuschauer') }],
    };
    expect(lockupToSummary(live)?.viewCountText).toBe('10.551 aktive Zuschauer');
  });

  it('erkennt Livestreams', () => {
    const summary = lockupToSummary(lockup({}, 'LIVE'));
    expect(summary?.isLive).toBe(true);
    expect(summary?.durationSeconds).toBeUndefined();
  });

  it('überspringt Playlists und Einträge ohne ID', () => {
    expect(lockupToSummary(lockup({ content_type: 'PLAYLIST' }))).toBeUndefined();
    expect(lockupToSummary(lockup({ content_id: undefined }))).toBeUndefined();
  });
});
