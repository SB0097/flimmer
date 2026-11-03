/** Begrenzte Scrollposition: Überziehen darf die Leisten nicht umschalten. */
export function boundedScrollY(y: number, contentHeight: number, viewportHeight: number) {
  'worklet';
  return Math.max(0, Math.min(y, Math.max(0, contentHeight - viewportHeight)));
}

/** 0 = sichtbar, 1 = verborgen. Am Listenanfang bleibt kein leerer Kopfbereich. */
export function advanceChrome(progress: number, delta: number, y: number, headerHeight: number) {
  'worklet';
  const height = Math.max(1, headerHeight);
  return Math.max(0, Math.min(1, y / height, progress + delta / height));
}

export function settledChrome(direction: number, y: number, headerHeight: number) {
  'worklet';
  return direction > 0 ? Math.min(1, y / Math.max(1, headerHeight)) : 0;
}
