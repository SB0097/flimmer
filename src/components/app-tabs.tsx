import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PlatformPressable } from 'expo-router/react-navigation';
import {
  Tabs,
  BottomTabBar,
  type BottomTabBarButtonProps,
  type BottomTabBarProps,
} from 'expo-router/tabs';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { ScrollChromeProvider, useScrollChrome } from '@/components/scroll-chrome';
import { useTheme } from '@/hooks/use-theme';

function ScrollingTabBar(props: BottomTabBarProps) {
  const { progress, barHeight } = useScrollChrome();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.get() * barHeight }],
  }));
  return (
    <Animated.View style={[styles.bar, { height: barHeight }, style]}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

// Der Standard-Tippeffekt ist auf Android randlos: ein großer Kreis, der über die Leiste
// und die Systemnavigation hinausläuft. Stattdessen eine abgerundete Fläche im Tab.
function TabButton({ style, ...props }: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      android_ripple={{ borderless: false, foreground: true }}
      style={[style, styles.button]}
    />
  );
}

function AppTabNavigator() {
  const theme = useTheme();
  const { barHeight } = useScrollChrome();
  return (
    <Tabs
      tabBar={(props) => <ScrollingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          position: 'absolute',
          height: barHeight,
          borderTopWidth: 0,
          backgroundColor: theme.background,
        },
        tabBarItemStyle: { paddingTop: 4, paddingBottom: 2 },
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Start',
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="home"
              color={focused ? theme.accent : theme.textSecondary}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Bibliothek',
          tabBarIcon: ({ focused }) => (
            <MaterialIcons
              name="video-library"
              color={focused ? theme.accent : theme.textSecondary}
              size={22}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default function AppTabs() {
  return (
    <ScrollChromeProvider>
      <AppTabNavigator />
    </ScrollChromeProvider>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  button: { marginHorizontal: 24, borderRadius: 16, overflow: 'hidden' },
});
