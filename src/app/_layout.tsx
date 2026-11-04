import '@/polyfills';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { NowPlayingProvider } from '@/services/playback/now-playing';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = colorScheme === 'dark' ? Colors.dark : Colors.light;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: colors.accent } }}>
      <NowPlayingProvider>
        <StatusBar style="auto" />
        <AnimatedSplashOverlay />
        <Stack
          screenOptions={{
            headerTitleStyle: { fontSize: 18, fontWeight: '600' },
            headerTintColor: colors.accent,
            headerShadowVisible: false,
          }}>
          <Stack.Screen
            name="(tabs)"
            options={{
              headerShown: false,
              statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark',
            }}
          />
          <Stack.Screen
            name="watch/[id]"
            options={{
              headerShown: false,
              // durchsichtig, damit beim Runterziehen die App darunter sichtbar ist
              presentation: 'transparentModal',
              // Öffnen/Schließen animiert die Seite selbst (aus dem Mini-Player heraus / hinein)
              animation: 'none',
            }}
          />
          <Stack.Screen name="settings" options={{ title: 'Einstellungen' }} />
          <Stack.Screen
            name="downloads"
            options={{
              title: 'Downloads',
              statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark',
            }}
          />
          <Stack.Screen
            name="import"
            options={{
              title: 'YouTube-Daten importieren',
              statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark',
            }}
          />
          <Stack.Screen name="channel/[id]" options={{ title: 'Kanal' }} />
          <Stack.Screen
            name="playlists"
            options={{
              title: 'Playlists',
              statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark',
            }}
          />
          <Stack.Screen
            name="playlist/[id]"
            options={{
              title: 'Playlist',
              statusBarStyle: colorScheme === 'dark' ? 'light' : 'dark',
            }}
          />
        </Stack>
      </NowPlayingProvider>
    </ThemeProvider>
  );
}
