import { useEvent } from 'expo';
import type { VideoPlayer } from 'expo-video';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { autoSkip, CATEGORY_INFO, rearmable, type Segment } from '@/lib/segments';
import { useSponsorSettings } from '@/services/settings/sponsor-settings';

const TOAST_MS = 4000;

export interface SkipToast {
  label: string;
  /** Anfang des übersprungenen Bereichs (für „Rückgängig“) */
  from: number;
}

interface SponsorSkipState {
  toast?: SkipToast;
  undo(): void;
  dismiss(): void;
  /** Für den Überspringen-Knopf: Segment als erledigt markieren */
  markSkipped(uuid: string): void;
}

const SponsorSkipContext = createContext<SponsorSkipState>({
  undo: () => {},
  dismiss: () => {},
  markSkipped: () => {},
});

/**
 * Überspringt SponsorBlock-Segmente automatisch – unabhängig davon, welche Seite
 * gerade offen ist (auch im Mini-Player und im Hintergrund).
 */
export function SponsorSkipper({
  player,
  segments,
  children,
}: {
  player: VideoPlayer;
  segments: Segment[];
  children: ReactNode;
}) {
  const settings = useSponsorSettings();
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  const skipped = useRef(new Set<string>());
  const [toast, setToast] = useState<SkipToast>();

  // Neue Segmente (anderes Video) → Gedächtnis zurücksetzen
  useEffect(() => {
    skipped.current = new Set();
  }, [segments]);

  useEffect(() => {
    // Zurückgespult vor ein schon übersprungenes Segment → wieder scharf schalten
    rearmable(segments, currentTime, skipped.current).forEach((id) => skipped.current.delete(id));
    const result = autoSkip(segments, currentTime, settings, skipped.current);
    if (!result) return;
    result.segments.forEach((s) => skipped.current.add(s.uuid));
    player.seekBy(result.to - player.currentTime);
    const labels = [...new Set(result.segments.map((s) => CATEGORY_INFO[s.category].short))];
    setToast({ label: `${labels.join(' + ')} übersprungen`, from: result.segments[0].start });
  }, [currentTime, segments, settings, player]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const undo = useCallback(() => {
    // Zurück an den Anfang; die Segmente bleiben als „übersprungen“ markiert
    if (toast) player.seekBy(toast.from - player.currentTime);
    setToast(undefined);
  }, [player, toast]);

  const dismiss = useCallback(() => setToast(undefined), []);
  const markSkipped = useCallback((uuid: string) => skipped.current.add(uuid), []);

  const value = useMemo(
    () => ({ toast, undo, dismiss, markSkipped }),
    [toast, undo, dismiss, markSkipped],
  );
  return <SponsorSkipContext.Provider value={value}>{children}</SponsorSkipContext.Provider>;
}

export function useSponsorSkip() {
  return useContext(SponsorSkipContext);
}
