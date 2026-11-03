/** Bildschirm-Position des Videobilds im Mini-Player – Ziel der Schrumpf-Animation */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

let miniFrame: Frame | undefined;

export function setMiniPlayerFrame(frame: Frame) {
  miniFrame = frame;
}

export function getMiniPlayerFrame(): Frame | undefined {
  return miniFrame;
}
