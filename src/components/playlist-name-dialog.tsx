import { useRef, useState, type ComponentRef, type Ref } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { MAX_PLAYLIST_NAME, playlistName } from '@/lib/playlists';

interface Props {
  initialName?: string;
  onSave: (name: string) => boolean;
  onCancel: () => void;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  autoFocus?: boolean;
}

export function PlaylistNameForm({
  initialName = '',
  onSave,
  onCancel,
  inputRef,
  autoFocus = true,
}: Props) {
  const theme = useTheme();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();
  const save = () => {
    try {
      if (!onSave(playlistName(name)))
        setError('Speichern fehlgeschlagen. Bitte versuche es erneut.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Der Name ist ungültig.');
    }
  };
  return (
    <View style={styles.form}>
      <TextInput
        ref={inputRef}
        accessibilityLabel="Name der Playlist"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(undefined);
        }}
        placeholder="Name der Playlist"
        placeholderTextColor={theme.textSecondary}
        maxLength={MAX_PLAYLIST_NAME}
        autoFocus={autoFocus}
        selectTextOnFocus={Boolean(initialName)}
        returnKeyType="done"
        onSubmitEditing={save}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      {error ? (
        <ThemedText type="small" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
      <View style={styles.buttons}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.button}>
          <ThemedText type="smallBold">Abbrechen</ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={save} style={styles.button}>
          <ThemedText type="smallBold">Speichern</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export function PlaylistNameDialog({ title, ...props }: Props & { title: string }) {
  const theme = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={props.onCancel}
      onShow={() => {
        // Android braucht nach dem Dialog-Aufbau kurz den Fensterfokus für die Tastatur.
        setTimeout(() => input.current?.focus(), 200);
      }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.center}>
        <Pressable style={styles.backdrop} onPress={props.onCancel} accessible={false} />
        <View
          accessibilityViewIsModal
          style={[styles.dialog, { backgroundColor: theme.background }]}>
          <ThemedText type="subtitle">{title}</ThemedText>
          <PlaylistNameForm {...props} inputRef={input} autoFocus={false} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dialog: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: 16,
  },
  form: { gap: 12 },
  input: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, fontSize: 16 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' },
});
