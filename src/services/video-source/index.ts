import { File, Paths } from 'expo-file-system';
import { Log } from 'youtubei.js';

import { YouTubeJsSource } from './youtubejs/YouTubeJsSource';

export * from './types';

// Parser-Hinweise von YouTube.js nur im Entwicklungsmodus anzeigen
Log.setLevel(__DEV__ ? Log.Level.WARNING : Log.Level.ERROR);

async function saveDashManifest(videoId: string, xml: string): Promise<string> {
  const file = new File(Paths.cache, `dash-${videoId}.mpd`);
  if (!file.exists) file.create();
  await file.write(xml);
  return file.uri;
}

/** Die in der App verwendete Datenquelle */
export const videoSource = new YouTubeJsSource({ saveDashManifest });
