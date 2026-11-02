import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QualityOption } from '@/lib/hls';
import { remainingLabel, SLEEP_OPTIONS } from '@/lib/sleep-timer';

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
  sleepEndsAt?: number;
  onSetSleepTimer: (minutes: number | undefined) => void;
}

type Page = 'main' | 'quality' | 'sleep';

/** Player-Menü hinter dem Zahnrad, wie bei YouTube: Qualität und Sleep-Timer */
export function PlayerMenu({
  visible,
  onClose,
  qualityOptions,
  quality,
  autoHeight,
  onSelectQuality,
  sleepEndsAt,
  onSetSleepTimer,
}: Props) {
  const theme = useTheme();
  const [page, setPage] = useState<Page>('main');
  const now = useNow(visible && sleepEndsAt !== undefined);

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
  const sleepText = sleepEndsAt ? remainingLabel(sleepEndsAt - now) : 'Aus';

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

        {page === 'main' ? (
          <>
            {qualityOptions.length > 0 ? (
              <MenuEntry
                icon="tune"
                label="Qualität"
                value={qualityText}
                onPress={() => setPage('quality')}
              />
            ) : null}
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
            {option('off', 'Aus', !sleepEndsAt, () => {
              onSetSleepTimer(undefined);
              close();
            })}
            {SLEEP_OPTIONS.map((minutes) =>
              option(String(minutes), `${minutes} Minuten`, false, () => {
                onSetSleepTimer(minutes);
                close();
              }),
            )}
            {sleepEndsAt ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                Läuft – {sleepText}. Danach wird der Ton ausgeblendet und pausiert.
              </ThemedText>
            ) : null}
          </>
        ) : null}
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
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.icon}>
        <MaterialIcons name={icon} size={22} color={theme.text} />
      </View>
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Spacing.five,
    paddingTop: Spacing.two,
  },
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
