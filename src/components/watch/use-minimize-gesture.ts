import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder } from 'react-native';

import type { Frame } from '@/services/playback/mini-frame';

/** Ab diesem Fortschritt (0–1) oder dieser Geschwindigkeit (px/ms) wird minimiert */
const DONE_PROGRESS = 0.35;
const DONE_VELOCITY = 0.9;
/** Weg (px) beim Hochwischen, nach dem das Video maximal angehoben ist */
const LIFT_DISTANCE = 140;

interface Options {
  isFullscreen: boolean;
  /** Aktuelle Position des Videos und Ziel (Videobild im Mini-Player) */
  getFrames: () => { video?: Frame; target: Frame };
  onMinimize: () => void;
  onExitFullscreen: () => void;
  /** Nach oben wischen im Hochformat → Vollbild (wie YouTube) */
  onEnterFullscreen: () => void;
  /** Seite startet „im Mini-Player“ (unsichtbar klein) und wächst per expandFromMini heraus */
  startMinimized?: boolean;
}

/** Wie weit und wie stark das Video schrumpfen muss, um genau auf dem Mini-Player zu landen */
export function minimizeTransform(video: Frame, target: Frame) {
  const dx = target.x + target.width / 2 - (video.x + video.width / 2);
  const dy = target.y + target.height / 2 - (video.y + video.height / 2);
  const scale = target.width / video.width;
  return { dx, dy, scale };
}

/**
 * Video nach unten ziehen wie bei YouTube: Das Video schrumpft unter dem Finger
 * und wandert zum Mini-Player, der Rest der Seite blendet aus. Loslassen nach
 * genug Weg → Mini-Player, sonst zurück. Im Vollbild beendet Runterziehen das Vollbild.
 *
 * Mit dem eingebauten Touch-System (PanResponder): Es greift erst bei einer
 * deutlich senkrechten Bewegung ein, Tippen und seitliches Spulen bleiben frei.
 */
export function useMinimizeGesture(options: Options) {
  const [anim] = useState(() => createAnimation(options.startMinimized ?? false));
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  // eslint-disable-next-line react-hooks/refs -- Handler lesen die Refs erst beim Ziehen, nicht beim Rendern
  const [controller] = useState(() => {
    const { progress, dx, dy, scaleDelta, lift, exit } = anim;
    let distance = 1;
    let transitioning = false;
    let disposed = false;

    const resetRotation = () => {
      lift.stopAnimation();
      exit.stopAnimation();
      lift.setValue(0);
      exit.setValue(0);
      transitioning = false;
    };

    const rotateAfterAnimation = (fullscreen: boolean) => {
      if (transitioning || disposed) return;
      transitioning = true;
      // Erst die Geste abschließen, dann das native Layout drehen. Keine
      // Rückfederung gleichzeitig mit Rotation und SurfaceView-Neuaufbau.
      Animated.timing(fullscreen ? lift : exit, {
        toValue: fullscreen ? 0 : 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || disposed) {
          transitioning = false;
          return;
        }
        if (fullscreen) latest.current.onEnterFullscreen();
        else latest.current.onExitFullscreen();
      });
    };

    /** Weg vom aktuellen Video-Platz zum Mini-Fenster festlegen */
    const aim = () => {
      const { video, target } = latest.current.getFrames();
      if (!video) return false;
      const t = minimizeTransform(video, target);
      dx.setValue(t.dx);
      dy.setValue(t.dy);
      scaleDelta.setValue(t.scale - 1);
      distance = Math.max(1, t.dy);
      return true;
    };

    /** Video in den Mini-Player schrumpfen lassen, danach die Seite schließen */
    const minimize = () => {
      aim();
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) latest.current.onMinimize();
      });
    };

    /** Beim Öffnen aus dem Mini-Player: Video wächst aus dem Fenster heraus */
    const expandFromMini = () => {
      if (!aim()) return;
      progress.setValue(1);
      Animated.timing(progress, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    const springBack = () =>
      Animated.parallel([
        Animated.spring(progress, {
          toValue: 0,
          damping: 20,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.spring(lift, {
          toValue: 0,
          damping: 22,
          stiffness: 240,
          overshootClamping: true,
          useNativeDriver: true,
        }),
        Animated.spring(exit, {
          toValue: 0,
          damping: 22,
          stiffness: 240,
          overshootClamping: true,
          useNativeDriver: true,
        }),
      ]).start();

    const responder = PanResponder.create({
      // Deutlich senkrecht: nach unten immer, nach oben nur im Hochformat (→ Vollbild)
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !transitioning &&
        Math.abs(g.dy) > 12 &&
        Math.abs(g.dy) > Math.abs(g.dx) * 1.5 &&
        (g.dy > 0 || !latest.current.isFullscreen),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        progress.stopAnimation();
        lift.stopAnimation();
        exit.stopAnimation();
        if (!latest.current.isFullscreen) aim();
      },
      onPanResponderMove: (_, g) => {
        if (transitioning) return;
        if (latest.current.isFullscreen) {
          exit.setValue(Math.min(1, Math.max(0, g.dy / 240)));
          return;
        }
        if (g.dy < 0) {
          // Hochwischen: Video folgt dem Finger ein Stück und wird etwas größer
          lift.setValue(Math.min(1, -g.dy / LIFT_DISTANCE));
          progress.setValue(0);
          return;
        }
        lift.setValue(0);
        progress.setValue(Math.min(1, Math.max(0, g.dy / distance)));
      },
      onPanResponderRelease: (_, g) => {
        if (transitioning) return;
        if (latest.current.isFullscreen) {
          if (g.dy > 120 || g.vy > DONE_VELOCITY) rotateAfterAnimation(false);
          else springBack();
          return;
        }
        if (g.dy < 0) {
          if (g.dy < -60 || g.vy < -DONE_VELOCITY) rotateAfterAnimation(true);
          else springBack();
          return;
        }
        if (g.dy / distance > DONE_PROGRESS || g.vy > DONE_VELOCITY) minimize();
        else springBack();
      },
      onPanResponderTerminate: springBack,
    });

    return {
      panHandlers: responder.panHandlers,
      minimize,
      expandFromMini,
      resetRotation,
      activate: () => {
        disposed = false;
      },
      dispose: () => {
        disposed = true;
        progress.stopAnimation();
        resetRotation();
      },
    };
  });

  useLayoutEffect(() => controller.resetRotation(), [controller, options.isFullscreen]);
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);

  return {
    panHandlers: controller.panHandlers,
    minimize: controller.minimize,
    expandFromMini: controller.expandFromMini,
    videoStyle: anim.videoStyle,
    fullscreenStyle: anim.fullscreenStyle,
    contentOpacity: anim.contentOpacity,
    backgroundOpacity: anim.backgroundOpacity,
    navOpacity: anim.navOpacity,
  };
}

/** Animierte Werte einmalig anlegen (bleiben über alle Renders gleich) */
function createAnimation(startMinimized: boolean) {
  // Startet die Seite im Mini-Player, ist das Video bis zum Wachsen unsichtbar (Skalierung 0)
  const progress = new Animated.Value(startMinimized ? 1 : 0);
  const dx = new Animated.Value(0);
  const dy = new Animated.Value(0);
  const scaleDelta = new Animated.Value(startMinimized ? -1 : 0);
  /** 0–1 beim Hochwischen (Richtung Vollbild) */
  const lift = new Animated.Value(0);
  const exit = new Animated.Value(0);
  return {
    progress,
    dx,
    dy,
    scaleDelta,
    lift,
    exit,
    fullscreenStyle: {
      transform: [
        { translateY: Animated.multiply(exit, 24) },
        { scale: Animated.add(1, Animated.multiply(exit, -0.04)) },
      ],
    },
    /** Für das Video: schrumpft und wandert Richtung Mini-Player */
    videoStyle: {
      transform: [
        { translateX: Animated.multiply(progress, dx) },
        { translateY: Animated.multiply(progress, dy) },
        { scale: Animated.add(1, Animated.multiply(progress, scaleDelta)) },
        // Hochwischen: bis zu 28 px nach oben und 8 % größer
        { translateY: Animated.multiply(lift, -28) },
        { scale: Animated.add(1, Animated.multiply(lift, 0.08)) },
      ],
    },
    /** Für Titel, Kommentare, Liste: blendet schnell aus */
    contentOpacity: progress.interpolate({
      inputRange: [0, 0.4],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }),
    /** Für den Bereich über der Tab-Leiste: wird früh durchsichtig, damit die Leiste schon beim Ziehen da ist */
    navOpacity: progress.interpolate({
      inputRange: [0, 0.3],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }),
    /** Für den Seitenhintergrund: wird durchsichtig, die App darunter erscheint */
    backgroundOpacity: progress.interpolate({
      inputRange: [0, 0.9],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    }),
  };
}
