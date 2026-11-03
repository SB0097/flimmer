import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QualityOption } from '@/lib/hls';
import { remainingLabel, SLEEP_OPTIONS, type SleepTimer } from '@/lib/sleep-timer';
import type { CaptionTrack } from '@/services/video-source';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Qualitäten; leer = keine Auswahl möglich (z. B. Livestream ohne Stufen) */
  qualityOptions: QualityOption[];
  /** `undefined` = Auto */
  quality?: number;
  /** Tatsächlich gespielte Höhe im Auto-Modus, z. B. 720 */
  autoHeight?: number;
  onSelectQuality: (height: number | undefined) => void;
  sleepTimer?: SleepTimer;
  onSetSleepTimer: (choice: number | 'endOfVideo' | undefined) => void;
  /** Bei Livestreams gibt es kein „Ende des Videos“ */
  isLive?: boolean;
  captions?: CaptionTrack[];
  caption?: CaptionTrack;
  captionBusy?: boolean;
  captionError?: string;
  onSelectCaption: (track: CaptionTrack | undefined) => void;
}

type Page = 'main' | 'quality' | 'sleep' | 'captions';

/** Player-Menü hinter dem Zahnrad, wie bei YouTube: Qualität und Sleep-Timer */
export function PlayerMenu({
  visible,
  onClose,
  qualityOptions,
  quality,
  autoHeight,
  onSelectQuality,
  sleepTimer,
  onSetSleepTimer,
  isLive = false,
  captions = [],
  caption,
  captionBusy,
  captionError,
  onSelectCaption,
}: Props) {
  const theme = useTheme();
  const [page, setPage] = useState<Page>('main');
  const now = useNow(visible && sleepTimer?.kind === 'time');

  const close = () => {
    setPage('main');
    onClose();
  };

  const qualityText =
    quality !== undefined
      ? (qualityOptions.find((o) => o.height === quality)?.label ?? `${quality}p`)
      : autoHeight
        ? `Auto (${autoHeight}p)`
        : 'Auto';
  const sleepText = !sleepTimer
    ? 'Aus'
    : sleepTimer.kind === 'endOfVideo'
      ? 'Ende des Videos'
      : remainingLabel(sleepTimer.endsAt - now);

  const option = (
    key: string,
    label: string,
    active: boolean,
    onPress: () => void,
    sub?: string,
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}>
      <View style={styles.icon}>
        {active ? <MaterialIcons name="check" size={22} color={theme.text} /> : null}
      </View>
      <View style={styles.flex}>
        <ThemedText>{label}</ThemedText>
        {sub ? (
          <ThemedText type="small" themeColor="textSecondary">
            {sub}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Schließen" />
      <ThemedView style={styles.sheet}>
        <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />
        <ScrollView style={styles.scroll}>
          {page === 'main' ? (
            <>
              {qualityOptions.length > 0 ? (
                <MenuEntry
                  icon="tune"
                  label="Qualität"
                  value={captionBusy ? 'Bitte kurz warten …' : qualityText}
                  disabled={captionBusy}
                  onPress={() => setPage('quality')}
                />
              ) : null}
              <MenuEntry
                icon="closed-caption"
                label="Untertitel"
                value={captionBusy ? 'Wird geladen …' : (caption?.name ?? 'Aus')}
                onPress={() => setPage('captions')}
              />
              <MenuEntry
                icon="bedtime"
                label="Sleep-Timer"
                value={sleepText}
                onPress={() => setPage('sleep')}
              />
            </>
          ) : null}

          {page === 'quality' ? (
            <>
              <SubTitle title="Qualität" onBack={() => setPage('main')} />
              {option(
                'auto',
                'Automatisch',
                quality === undefined,
                () => {
                  onSelectQuality(undefined);
                  close();
                },
                autoHeight ? `gerade ${autoHeight}p` : 'passt sich der Verbindung an',
              )}
              {qualityOptions.map((o) =>
                option(String(o.height), o.label, o.height === quality, () => {
                  onSelectQuality(o.height);
                  close();
                }),
              )}
            </>
          ) : null}

          {page === 'sleep' ? (
            <>
              <SubTitle title="Sleep-Timer" onBack={() => setPage('main')} />
              {option('off', 'Aus', !sleepTimer, () => {
                onSetSleepTimer(undefined);
                close();
              })}
              {!isLive
                ? option('end', 'Ende des Videos', sleepTimer?.kind === 'endOfVideo', () => {
                    onSetSleepTimer('endOfVideo');
                    close();
                  })
                : null}
              {SLEEP_OPTIONS.map((minutes) =>
                option(String(minutes), `${minutes} Minuten`, false, () => {
                  onSetSleepTimer(minutes);
                  close();
                }),
              )}
              {sleepTimer ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  Läuft – {sleepText}. Danach wird der Ton ausgeblendet und pausiert.
                </ThemedText>
              ) : null}
            </>
          ) : null}

          {page === 'captions' ? (
            <>
              <SubTitle title="Untertitel" onBack={() => setPage('main')} />
              {option('off', 'Aus', !caption, () => onSelectCaption(undefined))}
              {captions.map((track) =>
                option(
                  track.id,
                  track.name,
                  caption?.id === track.id,
                  () => onSelectCaption(track),
                  track.autoGenerated ? 'Automatisch erzeugt' : undefined,
                ),
              )}
              {!captions.length ? (
                <ThemedText style={styles.note} themeColor="textSecondary">
                  Für dieses Video sind keine Untertitel verfügbar.
                </ThemedText>
              ) : null}
              {captionBusy ? (
                <ThemedText style={styles.note} accessibilityLiveRegion="polite">
                  Untertitel werden geladen …
                </ThemedText>
              ) : null}
            </>
          ) : null}
          {captionError ? (
            <ThemedText style={styles.note} accessibilityRole="alert">
              {captionError}
            </ThemedText>
          ) : null}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

/** Aktuelle Uhrzeit, die sich jede Sekunde aktualisiert, solange `active` ist */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [active]);
  return now;
}

function MenuEntry({
  icon,
  label,
  value,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ disabled }}>
      <View style={styles.icon}>
        <MaterialIcons name={icon} size={22} color={theme.text} />
      </View>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.value}>
        {value}
      </ThemedText>
      <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />
    </Pressable>
  );
}

function SubTitle({ title, onBack }: { title: string; onBack: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onBack} style={styles.row} accessibilityRole="button">
      <View style={styles.icon}>
        <MaterialIcons name="arrow-back" size={22} color={theme.text} />
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Spacing.five,
    paddingTop: Spacing.two,
  },
  scroll: { flexGrow: 0 },
  value: { maxWidth: '50%', flexShrink: 1 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.two,
  },
  icon: {
    width: 28,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  note: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
});
