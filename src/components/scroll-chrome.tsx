import { useFocusEffect, useIsFocused } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type PropsWithChildren,
} from 'react';
import {
  Keyboard,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { MiniPlayer } from '@/components/mini-player';
import { useTheme } from '@/hooks/use-theme';
import { advanceChrome, boundedScrollY, settledChrome } from '@/lib/scroll-chrome';
import { setMiniPlayerFrame, type Frame } from '@/services/playback/mini-frame';

const TAB_HEIGHT = 64;
const ANIMATION = { duration: 200 };
const ChromeContext = createContext<{
  progress: SharedValue<number>;
  barHeight: number;
  show: () => void;
  focusTab: (key: string) => void;
} | null>(null);

export function ScrollChromeProvider({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const root = useRef<ComponentRef<typeof View>>(null);
  const frame = useRef<Frame | undefined>(undefined);
  const lastTab = useRef<string | undefined>(undefined);
  const progress = useSharedValue(0);
  const barHeight = TAB_HEIGHT + insets.bottom;
  const show = useCallback(() => {
    progress.set(withTiming(0, ANIMATION));
  }, [progress]);
  const focusTab = useCallback(
    (key: string) => {
      if (lastTab.current !== key) show();
      lastTab.current = key;
    },
    [show],
  );

  // Auch vor dem ersten Video ist das Ziel der Verkleinerungsanimation bekannt.
  // Beim Scrollen nur die Koordinaten fortschreiben, nicht jedes Bild neu messen.
  const reportMiniFrame = useCallback(
    (hidden: number) => {
      const bounds = frame.current;
      if (!focused || !bounds) return;
      const miniWidth = Math.round(width * 0.52);
      const miniHeight = Math.round((miniWidth * 9) / 16);
      setMiniPlayerFrame({
        x: bounds.x + bounds.width - miniWidth - 8,
        y: bounds.y + bounds.height - insets.bottom - TAB_HEIGHT * (1 - hidden) - miniHeight - 8,
        width: miniWidth,
        height: miniHeight,
      });
    },
    [focused, width, insets.bottom],
  );
  const measure = useCallback(() => {
    if (!focused) return;
    root.current?.measureInWindow((x, y, w, h) => {
      frame.current = { x, y, width: w, height: h };
      reportMiniFrame(progress.get());
    });
  }, [focused, reportMiniFrame, progress]);
  useEffect(measure, [measure]);
  useAnimatedReaction(
    () => progress.get(),
    (value) => scheduleOnRN(reportMiniFrame, value),
    [reportMiniFrame],
  );
  const miniStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -TAB_HEIGHT * (1 - progress.get()) }],
  }));

  return (
    <ChromeContext value={{ progress, barHeight, show, focusTab }}>
      <View ref={root} style={styles.flex} onLayout={measure}>
        {children}
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { bottom: insets.bottom }, miniStyle]}>
          <MiniPlayer />
        </Animated.View>
      </View>
    </ChromeContext>
  );
}

export function useScrollChrome() {
  const value = useContext(ChromeContext);
  if (!value) throw new Error('ScrollChromeProvider fehlt');
  return value;
}

/** Beide Leisten folgen dem Finger auf dem UI-Thread, auch während Videos laden. */
export function useScrollingChrome(key: string, initialHeight: number) {
  const { progress, barHeight, show, focusTab } = useScrollChrome();
  const [headerHeight, setHeaderHeight] = useState(initialHeight);
  const previousY = useSharedValue(0);
  const direction = useSharedValue(0);
  const active = useSharedValue(false);
  const locked = useSharedValue(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      if (!active.get()) return;
      locked.set(true);
      show();
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => locked.set(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [active, locked, show]);
  useFocusEffect(
    useCallback(() => {
      active.set(true);
      focusTab(key);
      return () => {
        active.set(false);
        cancelAnimation(progress);
      };
    }, [active, focusTab, key, progress]),
  );
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (event) => {
      cancelAnimation(progress);
      previousY.set(
        boundedScrollY(
          event.contentOffset.y,
          event.contentSize.height,
          event.layoutMeasurement.height,
        ),
      );
      direction.set(0);
    },
    onScroll: (event) => {
      const y = boundedScrollY(
        event.contentOffset.y,
        event.contentSize.height,
        event.layoutMeasurement.height,
      );
      const delta = y - previousY.get();
      previousY.set(y);
      if (!active.get() || locked.get()) return;
      if (Math.abs(delta) > 1) direction.set(delta);
      progress.set(advanceChrome(progress.get(), delta, y, headerHeight));
    },
    onEndDrag: () => {
      if (!active.get() || locked.get() || direction.get() === 0) return;
      progress.set(
        withTiming(settledChrome(direction.get(), previousY.get(), headerHeight), ANIMATION),
      );
    },
    onMomentumEnd: () => {
      if (!active.get() || locked.get() || direction.get() === 0) return;
      progress.set(
        withTiming(settledChrome(direction.get(), previousY.get(), headerHeight), ANIMATION),
      );
    },
  });
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -headerHeight * progress.get() }],
  }));
  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    setHeaderHeight(event.nativeEvent.layout.height);
  }, []);
  const setEditing = useCallback(
    (editing: boolean) => {
      locked.set(editing);
      if (editing) show();
    },
    [locked, show],
  );
  return { headerHeight, barHeight, headerStyle, onHeaderLayout, onScroll, show, setEditing };
}

/** Hinter den Statussymbolen bleibt auch bei verborgenem Suchfeld ein ruhiger Hintergrund. */
export function ScrollStatusBar() {
  const { top } = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[styles.status, { height: top, backgroundColor: theme.background }]}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
});
