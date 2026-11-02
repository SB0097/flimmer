import '@/polyfills';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { NowPlayingProvider } from '@/services/playback/now-playing';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <NowPlayingProvider>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="watch/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Einstellungen' }} />
        </Stack>
      </NowPlayingProvider>
    </ThemeProvider>
  );
}
