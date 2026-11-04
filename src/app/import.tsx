import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/components/mini-player';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { library } from '@/services/library/store';
import type { LibraryImport, ImportResult } from '@/services/library/import-types';
import { MAX_IMPORT_BYTES, parseTakeout } from '@/services/takeout/parser';

export default function ImportScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<LibraryImport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ImportResult>();
  const choose = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setPreview(undefined);
    setResult(undefined);
    let picked: DocumentPicker.DocumentPickerAsset[] = [];
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (selection.canceled) return;
      picked = selection.assets;
      if (picked.reduce((n, asset) => n + (asset.size ?? 0), 0) > MAX_IMPORT_BYTES)
        throw new Error('Bitte höchstens 64 MB auswählen. Große Archive zuerst entpacken.');
      const files = [];
      let total = 0;
      for (const asset of picked) {
        const file = new File(asset.uri);
        total += file.size;
        if (total > MAX_IMPORT_BYTES)
          throw new Error('Bitte höchstens 64 MB auswählen. Große Archive zuerst entpacken.');
        files.push({ name: asset.name, bytes: await file.bytes() });
      }
      setPreview(parseTakeout(files));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      // Nur die vom Picker erzeugten Cache-Kopien entfernen, niemals die Originaldateien.
      for (const asset of picked)
        if (asset.uri.startsWith(Paths.cache.uri + 'DocumentPicker/')) {
          try {
            const copy = new File(asset.uri);
            if (copy.exists) copy.delete();
          } catch {
            /* Der Cache wird bei Bedarf vom System bereinigt. */
          }
        }
      setBusy(false);
    }
  };
  const save = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError(undefined);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const imported = library.importData(preview);
    if (imported) {
      setResult(imported);
      setPreview(undefined);
    } else
      setError(library.get().error ?? 'Import fehlgeschlagen. Die Bibliothek bleibt unverändert.');
    setBusy(false);
  };
  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 160, gap: 16 }}>
        <ThemedText type="subtitle">Dein YouTube in Flimmer</ThemedText>
        <ThemedText type="small">
          Exportiere bei Google Takeout unter „YouTube und YouTube Music“ deine Abos, den
          Wiedergabeverlauf und bei Bedarf Playlists. Wähle ZIP als Archivformat; Videodateien
          werden nicht benötigt.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Du kannst das ZIP oder die entpackten CSV-, JSON- und HTML-Dateien auswählen. Das Einlesen
          bleibt lokal. Vor dem Speichern siehst du eine Vorschau.
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void choose()}
          style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Exportdateien auswählen</ThemedText>
        </Pressable>
        {busy ? <ActivityIndicator accessibilityLabel="Import wird verarbeitet" /> : null}
        {error ? (
          <ThemedText type="small" accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        {preview ? (
          <View style={[styles.box, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">Vorschau</ThemedText>
            <ThemedText type="small">
              {preview.subscriptions.length} Abos · {preview.history.length} Verlaufseinträge ·{' '}
              {preview.playlists.length} Playlists
            </ThemedText>
            <ThemedText type="small">
              Bestehende Abos, Playlist-Reihenfolgen und Sehpositionen gleicher Videos bleiben
              erhalten. Doppelte Einträge werden übersprungen. Der Verlauf enthält anschließend
              höchstens die 1.000 neuesten unterschiedlichen Videos.
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Der Export enthält keine genauen Sehpositionen oder angesehenen Dauern. Importierte
              Videos zählen als Interesse für „Für dich“. Fehlende Videotitel und Kanaldaten werden
              beim späteren Öffnen ergänzt.
            </ThemedText>
            {preview.warnings.map((message) => (
              <ThemedText key={message} type="small">
                {message}
              </ThemedText>
            ))}
            {preview.playlists.slice(0, 5).map((p) => (
              <ThemedText key={p.key} type="small">
                {p.name} · {p.videos.length} Videos
              </ThemedText>
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void save()}
              style={styles.button}>
              <ThemedText type="smallBold">Jetzt zur Bibliothek hinzufügen</ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setPreview(undefined)}
              style={styles.button}>
              <ThemedText type="small">Verwerfen</ThemedText>
            </Pressable>
          </View>
        ) : null}
        {result ? (
          <View style={styles.box}>
            <ThemedText type="smallBold">Import abgeschlossen</ThemedText>
            <ThemedText type="small">
              Neu ergänzt: {result.subscriptions} Abos, {result.history} Verlaufseinträge,{' '}
              {result.playlists} Playlists und {result.videos} Playlist-Videos. Bereits vorhandene
              Einträge wurden nicht doppelt angelegt.
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
      <MiniPlayer bottomInset={insets.bottom} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  button: {
    minHeight: 48,
    padding: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: { padding: 16, borderRadius: 12, gap: 12 },
});
