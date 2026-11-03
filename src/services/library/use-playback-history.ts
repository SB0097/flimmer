import type { VideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { WatchProgress } from '@/lib/watch-progress';
import type { VideoSummary } from '@/services/video-source/types';

import { library } from './store';

/** Einmal am app-weiten Player: gilt auch im Mini-Player, PiP und Hintergrund. */
export function usePlaybackHistory(player: VideoPlayer, video?: VideoSummary) {
  useEffect(() => {
    if (!video) return;
    const progress = new WatchProgress();
    const version = library.historyVersion(video.id);
    let position = player.currentTime;
    let wasPlaying = player.playing;
    let pending = 0;
    let recorded = library.get().history.some((h) => h.video.id === video.id);
    let lastSaved = Date.now();
    let savedPosition = position;
    progress.sample(position, lastSaved, false);

    const sample = () => {
      position = player.currentTime;
      progress.sample(position, Date.now(), wasPlaying, player.playbackRate);
      pending += progress.take();
    };
    const flush = (completed = false) => {
      if (library.historyVersion(video.id) !== version) return;
      // Ein bloßes Öffnen oder ein fehlgeschlagener Stream erzeugt keinen Verlauf.
      if (!recorded && pending < 5 && !(completed && pending > 0)) return;
      if (!pending && !completed && position === savedPosition) return;
      if (library.record(video, { position, watchedSeconds: pending, completed })) {
        pending = 0;
        recorded = true;
        savedPosition = position;
      }
      lastSaved = Date.now();
    };
    const time = player.addListener('timeUpdate', () => {
      sample();
      if ((!recorded && pending >= 5) || Date.now() - lastSaved >= 15_000) flush();
    });
    const playing = player.addListener('playingChange', ({ isPlaying }) => {
      sample();
      wasPlaying = isPlaying;
      if (!isPlaying) flush();
    });
    const ended = player.addListener('playToEnd', () => {
      sample();
      flush(true);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        sample();
        flush();
      }
    });
    return () => {
      // Die letzte bekannte Position gehört sicher noch zur alten Quelle.
      flush();
      time.remove();
      playing.remove();
      ended.remove();
      appState.remove();
    };
  }, [player, video]);
}
