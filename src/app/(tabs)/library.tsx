import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Bibliothek</ThemedText>
        <ThemedText themeColor="textSecondary">
          Favoriten und Verlauf erscheinen hier, sobald M4 umgesetzt ist.
        </ThemedText>
        <Pressable
          onPress={() => router.push('/settings')}
          style={[styles.row, { backgroundColor: theme.backgroundElement }]}
          accessibilityRole="button">
          <MaterialIcons name="settings" size={22} color={theme.text} />
          <ThemedText style={styles.flex}>Einstellungen</ThemedText>
          <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
});
