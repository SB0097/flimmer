import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

/** Ab dieser Strecke (px) oder Geschwindigkeit (px/ms) gilt das Runterziehen als „minimieren“ */
const DISTANCE = 120;
const VELOCITY = 0.9;

interface Options {
  isFullscreen: boolean;
  screenHeight: number;
  onMinimize: () => void;
  onExitFullscreen: () => void;
}

/**
 * Video nach unten ziehen wie bei YouTube:
 * - Hochformat: die Seite folgt dem Finger, beim Loslassen wird sie zum Mini-Player
 * - Vollbild: Vollbild wird beendet
 *
 * Bewusst mit dem eingebauten Touch-System (PanResponder): Es greift erst bei einer
 * deutlich senkrechten Bewegung ein, Tippen auf Knöpfe und seitliches Spulen
 * bleiben unberührt.
 */
export function useMinimizeGesture(options: Options) {
  const [dragY] = useState(() => new Animated.Value(0));
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  // eslint-disable-next-line react-hooks/refs -- Handler lesen `latest` erst beim Ziehen, nicht beim Rendern
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (!latest.current.isFullscreen) dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        const { isFullscreen, screenHeight, onMinimize, onExitFullscreen } = latest.current;
        const done = g.dy > DISTANCE || g.vy > VELOCITY;
        if (isFullscreen) {
          if (done) onExitFullscreen();
          return;
        }
        if (done) {
          Animated.timing(dragY, {
            toValue: screenHeight,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onMinimize());
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            damping: 20,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  );

  return {
    panHandlers: responder.panHandlers,
    style: { transform: [{ translateY: dragY }] },
  };
}
