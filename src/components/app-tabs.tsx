import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs, BottomTabBar, type BottomTabBarProps } from 'expo-router/tabs';
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

function AppTabNavigator() {
  const theme = useTheme();
  const { barHeight } = useScrollChrome();
  return (
    <Tabs
      tabBar={(props) => <ScrollingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: {
          position: 'absolute',
          height: barHeight,
          borderTopWidth: 0,
          backgroundColor: theme.background,
        },
        tabBarItemStyle: { paddingTop: 6 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Start',
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons
              name="home"
              color={focused ? theme.text : theme.textSecondary}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Bibliothek',
          tabBarIcon: ({ focused, size }) => (
            <MaterialIcons
              name="video-library"
              color={focused ? theme.text : theme.textSecondary}
              size={size}
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
});
