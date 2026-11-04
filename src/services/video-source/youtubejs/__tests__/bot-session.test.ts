import { Innertube } from 'youtubei.js';

import { StreamUnavailableError } from '../../types';
import { SESSION_RENEWAL_INTERVAL, YouTubeJsSource } from '../YouTubeJsSource';

jest.mock('youtubei.js', () => ({
  Constants: { CLIENTS: { VISIONOS: {}, ANDROID: {} } },
  Innertube: { create: jest.fn() },
  Platform: { shim: {} },
  YTNodes: {},
}));

const create = Innertube.create as jest.Mock;
const BOT = 'Melde dich an, um zu bestätigen, dass du kein Bot bist';

function info(status: string, reason?: string) {
  return {
    basic_info: { title: 'Video' },
    playability_status: { status, reason },
    streaming_data:
      status === 'OK' ? { hls_manifest_url: 'https://hls', adaptive_formats: [], formats: [] } : {},
  };
}

/** Jede erzeugte Sitzung antwortet mit den übergebenen Zuständen */
function sessions(...answers: ReturnType<typeof info>[]) {
  for (const answer of answers)
    create.mockResolvedValueOnce({ getBasicInfo: jest.fn().mockResolvedValue(answer) });
}

describe('YouTubeJsSource – Bot-Schutz', () => {
  beforeEach(() => {
    create.mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => jest.restoreAllMocks());

  it('holt bei Bot-Verdacht einmal eine frische Sitzung und spielt dann ab', async () => {
    sessions(info('LOGIN_REQUIRED', BOT), info('OK'));
    const source = new YouTubeJsSource({ clients: ['VISIONOS'] });

    const result = await source.getStreams('abc');

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.source.uri).toBe('https://hls');
    expect(result.attempts.map((a) => a.via)).toEqual(['VISIONOS', 'VISIONOS (neue Sitzung)']);
  });

  it('erneuert die Sitzung nicht bei anderen Fehlern', async () => {
    sessions(info('UNPLAYABLE', 'Nur für Mitglieder'));
    const source = new YouTubeJsSource({ clients: ['VISIONOS'] });

    await expect(source.getStreams('abc')).rejects.toBeInstanceOf(StreamUnavailableError);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('wechselt die Sitzung höchstens alle paar Minuten', async () => {
    sessions(info('LOGIN_REQUIRED', BOT), info('LOGIN_REQUIRED', BOT), info('OK'));
    const source = new YouTubeJsSource({ clients: ['VISIONOS'] });

    const first = await source.getStreams('abc').catch((e: StreamUnavailableError) => e);
    expect(first).toBeInstanceOf(StreamUnavailableError);
    expect((first as StreamUnavailableError).attempts).toHaveLength(2);
    await expect(source.getStreams('abc')).rejects.toBeInstanceOf(StreamUnavailableError);
    expect(create).toHaveBeenCalledTimes(2);

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + SESSION_RENEWAL_INTERVAL);
    const later = await source.getStreams('abc');
    expect(create).toHaveBeenCalledTimes(3);
    expect(later.source.uri).toBe('https://hls');
  });

  it('behält die bisherigen Versuche, wenn keine neue Sitzung zustande kommt', async () => {
    sessions(info('LOGIN_REQUIRED', BOT));
    create.mockRejectedValue(new Error('Network request failed'));
    const source = new YouTubeJsSource({ clients: ['VISIONOS'] });

    const error = (await source.getStreams('abc').catch((e) => e)) as StreamUnavailableError;
    expect(error.attempts.map((a) => a.via)).toEqual(['VISIONOS', 'neue Sitzung']);
  });
});
