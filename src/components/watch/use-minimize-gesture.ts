import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

import type { Frame } from '@/services/playback/mini-frame';

/** Ab diesem Fortschritt (0–1) oder dieser Geschwindigkeit (px/ms) wird minimiert */
const DONE_PROGRESS = 0.35;
const DONE_VELOCITY = 0.9;

interface Options {
  isFullscreen: boolean;
  /** Aktuelle Position des Videos und Ziel (Videobild im Mini-Player) */
  getFrames: () => { video?: Frame; target: Frame };
  onMinimize: () => void;
  onExitFullscreen: () => void;
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
  const [anim] = useState(createAnimation);
  const { progress, dx, dy, scaleDelta } = anim;
  const distance = useRef(1);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  // eslint-disable-next-line react-hooks/refs -- Handler lesen die Refs erst beim Ziehen, nicht beim Rendern
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (latest.current.isFullscreen) return;
        const { video, target } = latest.current.getFrames();
        if (!video) return;
        const t = minimizeTransform(video, target);
        dx.setValue(t.dx);
        dy.setValue(t.dy);
        scaleDelta.setValue(t.scale - 1);
        distance.current = Math.max(1, t.dy);
      },
      onPanResponderMove: (_, g) => {
        if (latest.current.isFullscreen) return;
        progress.setValue(Math.min(1, Math.max(0, g.dy / distance.current)));
      },
      onPanResponderRelease: (_, g) => {
        const { isFullscreen, onMinimize, onExitFullscreen } = latest.current;
        if (isFullscreen) {
          if (g.dy > 120 || g.vy > DONE_VELOCITY) onExitFullscreen();
          return;
        }
        const done = g.dy / distance.current > DONE_PROGRESS || g.vy > DONE_VELOCITY;
        if (done) {
          Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: true }).start(
            () => onMinimize(),
          );
        } else {
          Animated.spring(progress, {
            toValue: 0,
            damping: 20,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(progress, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  );

  return {
    panHandlers: responder.panHandlers,
    videoStyle: anim.videoStyle,
    contentOpacity: anim.contentOpacity,
    backgroundOpacity: anim.backgroundOpacity,
  };
}

/** Animierte Werte einmalig anlegen (bleiben über alle Renders gleich) */
function createAnimation() {
  const progress = new Animated.Value(0);
  const dx = new Animated.Value(0);
  const dy = new Animated.Value(0);
  const scaleDelta = new Animated.Value(0);
  return {
    progress,
    dx,
    dy,
    scaleDelta,
    /** Für das Video: schrumpft und wandert Richtung Mini-Player */
    videoStyle: {
      transform: [
        { translateX: Animated.multiply(progress, dx) },
        { translateY: Animated.multiply(progress, dy) },
        { scale: Animated.add(1, Animated.multiply(progress, scaleDelta)) },
      ],
    },
    /** Für Titel, Kommentare, Liste: blendet schnell aus */
    contentOpacity: progress.interpolate({
      inputRange: [0, 0.4],
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
